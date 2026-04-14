from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.interpolate import RectBivariateSpline

from app.models.schemas import InverseRecoInputs

MATERIAL_MAP = {
    'TPU(soft)': 'TPU',
    'MultiLayer': 'Multi',
    'PETG(hard)': 'PETG',
}
MATERIALS = ['TPU', 'Multi', 'PETG']
TOOTH_IDS = [17, 16, 15, 14, 13, 12, 11]


@dataclass
class SurfaceModel:
    heights: np.ndarray
    steps: np.ndarray
    spline: RectBivariateSpline

    @classmethod
    def from_grid(cls, heights: np.ndarray, steps: np.ndarray, values: np.ndarray) -> 'SurfaceModel':
        return cls(heights=heights, steps=steps, spline=RectBivariateSpline(heights, steps, values, kx=2, ky=2, s=0))

    def predict(self, height: float, step: float) -> float:
        return float(self.spline(float(height), float(step))[0, 0])


class RecommendV1Service:
    def __init__(self):
        backend_dir = Path(__file__).resolve().parents[2]
        self._load_env_file(backend_dir / '.env')
        self.data_path = self._resolve_data_path(backend_dir)
        self.df = self._load_data()
        self.heights = np.array(sorted(self.df['Alveolar height'].unique()), dtype=float)
        self.steps = np.array(sorted(self.df['Planned Intrusion (mm)'].unique()), dtype=float)
        self.metric_names = self._collect_metric_names()
        self.models = self._build_models()


    @staticmethod
    def _load_env_file(env_path: Path) -> None:
        if not env_path.exists():
            return
        for line in env_path.read_text(encoding='utf-8').splitlines():
            row = line.strip()
            if not row or row.startswith('#') or '=' not in row:
                continue
            k, v = row.split('=', 1)
            k = k.strip()
            v = v.strip().strip("'").strip('"')
            if k and k not in os.environ:
                os.environ[k] = v

    @staticmethod
    def _resolve_data_path(backend_dir: Path) -> Path:
        configured = os.getenv('INVERSE_DATA_PATH', '').strip() or os.getenv('INVERSE_DATA_XLSX_PATH', '').strip()
        if configured:
            p = Path(configured).expanduser()
            if not p.is_absolute():
                p = backend_dir / p
            if p.exists():
                return p
            raise FileNotFoundError(f'INVERSE_DATA_PATH/INVERSE_DATA_XLSX_PATH 指向文件不存在: {p}')

        candidates = [
            backend_dir / 'data' / 'P328101E02_仿真实验数据_260414.csv',
            backend_dir / 'data' / 'P328101E02_仿真实验数据_260414.xlsx',
        ]
        for default_path in candidates:
            if default_path.exists():
                return default_path
        raise FileNotFoundError(
            f'未找到默认数据文件: {candidates[0]}。请在 backend/.env 配置 INVERSE_DATA_PATH。'
        )

    def _load_data(self) -> pd.DataFrame:
        if not self.data_path.exists():
            raise FileNotFoundError(f'未找到数据文件：{self.data_path}')
        if self.data_path.suffix.lower() == '.csv':
            df = pd.read_csv(self.data_path)
        else:
            df = pd.read_excel(self.data_path)
        required = {'Aligner material', 'Alveolar height', 'Planned Intrusion (mm)', 'PDL_max (kPa)', 'Disp_Z_17', 'Disp_X_17', 'Disp_Y_17'}
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(f'数据缺少必要列：{missing}')

        out = df.copy()
        out['material'] = out['Aligner material'].map(MATERIAL_MAP)
        if out['material'].isna().any():
            bad = sorted(out[out['material'].isna()]['Aligner material'].dropna().unique().tolist())
            raise ValueError(f'存在未识别材料标签：{bad}')

        out['AbsDisp_X_17'] = out['Disp_X_17'].abs()
        out['AbsDisp_Y_17'] = out['Disp_Y_17'].abs()

        adj_sq = np.zeros(len(out), dtype=float)
        for tid in [16, 15, 14, 13, 12, 11]:
            adj_sq += out[f'Disp_X_{tid}'] ** 2 + out[f'Disp_Y_{tid}'] ** 2 + out[f'Disp_Z_{tid}'] ** 2
        out['AdjDriftRMS'] = np.sqrt(adj_sq / 6.0)
        return out

    def _collect_metric_names(self) -> List[str]:
        numeric = self.df.select_dtypes(include=[np.number]).columns.tolist()
        exclude = {'编号'}
        return [c for c in numeric if c not in exclude]

    def _build_models(self) -> Dict[str, Dict[str, SurfaceModel]]:
        models: Dict[str, Dict[str, SurfaceModel]] = {}
        for material in MATERIALS:
            sub = self.df[self.df['material'] == material].copy()
            models[material] = {}
            for metric in self.metric_names:
                pivot = sub.pivot(index='Alveolar height', columns='Planned Intrusion (mm)', values=metric).reindex(index=self.heights, columns=self.steps)
                if pivot.isna().any().any():
                    raise ValueError(f'数据网格不完整：{material} / {metric}')
                models[material][metric] = SurfaceModel.from_grid(self.heights, self.steps, pivot.values.astype(float))
        return models

    def _validate_input(self, inputs: InverseRecoInputs):
        hmin, hmax = float(self.heights.min()), float(self.heights.max())
        if not (hmin <= inputs.alveolar_height <= hmax):
            raise ValueError(f'alveolar_height 超出范围 [{hmin}, {hmax}]')

    def predict_metric(self, material: str, height: float, step: float, metric: str) -> float:
        return self.models[material][metric].predict(height, step)

    @staticmethod
    def _norm(arr: pd.Series) -> pd.Series:
        den = float(arr.max() - arr.min())
        if den < 1e-12:
            return pd.Series(np.zeros(len(arr)), index=arr.index)
        return (arr - arr.min()) / den

    def build_candidate_table(self, inputs: InverseRecoInputs, search_points: int = 301) -> pd.DataFrame:
        step_unit = 0.05
        sgrid = np.arange(float(self.steps.min()), float(self.steps.max()) + 1e-9, step_unit)
        target_intrusion = 0.10 if inputs.target_intrusion_mm is None else float(inputs.target_intrusion_mm)
        target_intrusion = float(np.clip(target_intrusion, 0.05, 0.20))
        risk_limit = 20.0 if inputs.risk_limit_kpa is None else float(inputs.risk_limit_kpa)
        rows: List[Dict[str, Any]] = []
        for material in MATERIALS:
            for planned in sgrid:
                rows.append({
                    'material': material,
                    'planned_intrusion_mm': float(planned),
                    'Disp_Z_17': self.predict_metric(material, inputs.alveolar_height, planned, 'Disp_Z_17'),
                    'PDL_max (kPa)': self.predict_metric(material, inputs.alveolar_height, planned, 'PDL_max (kPa)'),
                    'Disp_X_17': self.predict_metric(material, inputs.alveolar_height, planned, 'Disp_X_17'),
                    'Disp_Y_17': self.predict_metric(material, inputs.alveolar_height, planned, 'Disp_Y_17'),
                    'AbsDisp_X_17': abs(self.predict_metric(material, inputs.alveolar_height, planned, 'Disp_X_17')),
                    'AbsDisp_Y_17': abs(self.predict_metric(material, inputs.alveolar_height, planned, 'Disp_Y_17')),
                    'AdjDriftRMS': self.predict_metric(material, inputs.alveolar_height, planned, 'AdjDriftRMS'),
                })
        cand = pd.DataFrame(rows)

        norm_z = self._norm(cand['Disp_Z_17'])
        norm_step = self._norm(cand['planned_intrusion_mm'])
        ratio = np.clip(cand['Disp_Z_17'] / max(target_intrusion, 1e-6), 0.0, 1.0)
        target_scaled = float(np.clip((target_intrusion - 0.02) / 0.23, 0.0, 1.0))
        cand['score_target'] = np.clip(0.70 * ratio + 0.20 * norm_z + 0.10 * target_scaled * norm_step, 0.0, 1.0)
        cand['target_deviation_mm'] = cand['Disp_Z_17'] - target_intrusion

        sigma_risk = max(1.0, 0.12 * risk_limit)
        cand['score_risk'] = 1.0 / (1.0 + np.exp((cand['PDL_max (kPa)'] - risk_limit) / sigma_risk))
        cand['within_risk_limit'] = cand['PDL_max (kPa)'] <= risk_limit

        cand['phi_side'] = self._norm(cand['AbsDisp_X_17'])
        cand['score_side'] = 1.0 - cand['phi_side']

        weights = inputs.score_weights or {'target': 0.0, 'risk': 0.50, 'side': 0.50}
        w_target = float(weights.get('target', 0.50))
        w_risk = float(weights.get('risk', 0.35))
        w_side = float(weights.get('side', 0.15))
        w_sum = max(w_target + w_risk + w_side, 1e-9)
        w_target, w_risk, w_side = w_target / w_sum, w_risk / w_sum, w_side / w_sum

        cand['ComprehensiveScore'] = 100.0 * (w_target * cand['score_target'] + w_risk * cand['score_risk'] + w_side * cand['score_side'])
        cand['rank_percentile'] = cand['ComprehensiveScore'].rank(pct=True)
        return cand.sort_values(['ComprehensiveScore', 'score_risk', 'score_target'], ascending=False).reset_index(drop=True)

    def recommend(self, scalars: InverseRecoInputs, search_points: int = 301, surface_grid_size: int = 42) -> Dict[str, Any]:
        self._validate_input(scalars)
        cand = self.build_candidate_table(scalars, search_points=search_points)
        target_intrusion = 0.10 if scalars.target_intrusion_mm is None else float(scalars.target_intrusion_mm)
        target_intrusion = float(np.clip(target_intrusion, 0.05, 0.20))
        min_step = float(np.interp(target_intrusion, [0.05, 0.20], [float(self.steps.min()), float(self.steps.max())]))
        cand = cand[cand['planned_intrusion_mm'] >= min_step - 1e-9].copy() if not cand.empty else cand

        feasible = cand[cand['within_risk_limit']]
        use_feasible = len(feasible) > 0
        if use_feasible:
            pool = feasible
        else:
            pool = cand.copy()
            pool['risk_excess'] = pool['PDL_max (kPa)'] - (20.0 if scalars.risk_limit_kpa is None else float(scalars.risk_limit_kpa))
            pool = pool.sort_values(['risk_excess', 'PDL_max (kPa)', 'ComprehensiveScore'], ascending=[True, True, False])

        best = pool.iloc[0].to_dict()
        alts = pool.iloc[1:4].to_dict('records')

        best['surface_position'] = {
            'height_value': scalars.alveolar_height,
            'step_value': best['planned_intrusion_mm'],
            'rank_percentile': float(best['rank_percentile']),
            'rank_label': f"Top {max((1.0 - float(best['rank_percentile'])) * 100.0, 0.1):.1f}% 区域",
            'note': '推荐点已在各 3D 曲面中以 diamond 点标注。',
        }

        charts = self.build_chart_payload(cand, best, alts, scalars, grid_size=surface_grid_size)
        return {
            'status': 'feasible_recommendation' if use_feasible else 'approximate_recommendation',
            'best': best,
            'alternatives': alts,
            'charts': charts,
            'scoring_formula': {
                'comprehensive_score': '100 * (w_target*score_target + w_risk*score_risk + w_side*score_side)',
                'score_target': '0.7*clip(Disp_Z_17/target,0,1)+0.2*norm(Disp_Z_17)+0.1*target_scaled*norm(step), target范围[0.05,0.20]',
                'score_risk': 'sigmoid(-(PDL_max-risk_limit)/sigma_risk)，默认risk_limit=20kPa',
                'score_side': '1 - norm(|Disp_X_17|)（越接近0越优）',
                'defaults': {'target_intrusion_mm': 0.10, 'risk_limit_kpa': 20.0},
                'weights_used': scalars.score_weights or {'target': 0.0, 'risk': 0.50, 'side': 0.50},
            },
            'grid': cand.to_dict('records'),
        }

    def _surface_for_metric(self, metric: str, grid_size: int) -> Dict[str, Dict[str, Any]]:
        hgrid = np.linspace(float(self.heights.min()), float(self.heights.max()), int(grid_size))
        sgrid = np.linspace(float(self.steps.min()), float(self.steps.max()), int(grid_size))
        out: Dict[str, Dict[str, Any]] = {}
        for material in MATERIALS:
            rows = []
            for h in hgrid:
                row = [self.predict_metric(material, float(h), float(s), metric) for s in sgrid]
                rows.append(row)
            out[material] = {
                'x_heights': hgrid.tolist(),
                'y_planned_intrusion': sgrid.tolist(),
                'z_values': rows,
            }
        return out

    def _score_surface(self, cand: pd.DataFrame, grid_size: int) -> Dict[str, Dict[str, Any]]:
        hgrid = np.linspace(float(self.heights.min()), float(self.heights.max()), int(grid_size))
        sgrid = np.linspace(float(self.steps.min()), float(self.steps.max()), int(grid_size))
        out: Dict[str, Dict[str, Any]] = {}
        for material in MATERIALS:
            sub = cand[cand['material'] == material].sort_values('planned_intrusion_mm')
            z_rows = []
            for _ in hgrid:
                z_rows.append(np.interp(sgrid, sub['planned_intrusion_mm'], sub['ComprehensiveScore']).tolist())
            out[material] = {
                'x_heights': hgrid.tolist(),
                'y_planned_intrusion': sgrid.tolist(),
                'z_values': z_rows,
            }
        return out

    def _recommend_points(self, best: Dict[str, Any], alts: List[Dict[str, Any]], metric_col: str) -> List[Dict[str, Any]]:
        items = [best] + alts
        names = ['推荐'] + [f'备选{i}' for i in range(1, len(alts) + 1)]
        return [
            {
                'name': n,
                'material': str(it['material']),
                'value': [float(it['planned_intrusion_mm']), float(best['surface_position']['height_value']), float(it[metric_col])],
            }
            for n, it in zip(names, items)
        ]

    def build_chart_payload(self, cand: pd.DataFrame, best: Dict[str, Any], alts: List[Dict[str, Any]], inputs: InverseRecoInputs, grid_size: int) -> Dict[str, Any]:
        score_surface = self._score_surface(cand, grid_size)
        pdl_surface = self._surface_for_metric('PDL_max (kPa)', grid_size)
        z17_surface = self._surface_for_metric('Disp_Z_17', grid_size)
        x17_surface = self._surface_for_metric('Disp_X_17', grid_size)

        curve_rows = []
        for material in MATERIALS:
            sub = cand[cand['material'] == material].sort_values('planned_intrusion_mm')
            curve_rows.append({
                'material': material,
                'step_vs_score': sub[['planned_intrusion_mm', 'ComprehensiveScore']].values.tolist(),
                'step_vs_pdl': sub[['planned_intrusion_mm', 'PDL_max (kPa)']].values.tolist(),
                'step_vs_z17': sub[['planned_intrusion_mm', 'Disp_Z_17']].values.tolist(),
                'step_vs_x17': sub[['planned_intrusion_mm', 'Disp_X_17']].values.tolist(),
            })

        return {
            'surfaces': {
                'score': score_surface,
                'pdl_max': pdl_surface,
                'disp_z17': z17_surface,
                'disp_x17': x17_surface,
            },
            'recommend_points': {
                'score': self._recommend_points(best, alts, 'ComprehensiveScore'),
                'pdl_max': self._recommend_points(best, alts, 'PDL_max (kPa)'),
                'disp_z17': self._recommend_points(best, alts, 'Disp_Z_17'),
                'disp_x17': self._recommend_points(best, alts, 'Disp_X_17'),
            },
            'curves_2d': curve_rows,
            'motion_payload': self.predicted_motion_payload(str(best['material']), float(inputs.alveolar_height), float(best['planned_intrusion_mm'])),
        }

    def predicted_motion_payload(self, material: str, height: float, step: float) -> Dict[str, Any]:
        teeth = []
        for tid in TOOTH_IDS:
            teeth.append({
                'tooth_id': tid,
                'disp_x_mm': self.predict_metric(material, height, step, f'Disp_X_{tid}'),
                'disp_y_mm': self.predict_metric(material, height, step, f'Disp_Y_{tid}'),
                'disp_z_mm': self.predict_metric(material, height, step, f'Disp_Z_{tid}'),
            })
        return {
            'material': material,
            'alveolar_height': height,
            'planned_intrusion_mm': step,
            'teeth': teeth,
            'note': '用于前端牙体运动示意（拟合位移向量，不替代有限元重新计算）。',
        }

    def get_meta(self) -> Dict[str, Any]:
        return {
            'engine_version': 'INVERSE_V2',
            'materials': MATERIALS,
            'data_file': self.data_path.name,
            'range': {
                'alveolar_height': [float(self.heights.min()), float(self.heights.max())],
                'planned_intrusion_mm': [float(self.steps.min()), float(self.steps.max())],
            },
            'outputs': ['ComprehensiveScore', 'PDL_max (kPa)', 'Disp_Z_17', 'Disp_X_17'],
        }

    def build_report_pdf_bytes(self, req: InverseRecoInputs, recommendation: Dict[str, Any]) -> bytes:
        best = recommendation['best']

        def uhex(s: str) -> str:
            return s.encode('utf-16-be').hex().upper()

        lines = [
            '后牙压低逆向推荐报告',
            f"牙槽骨高度: {req.alveolar_height:.3f}",
            f"目标真实压低量(17): {req.target_intrusion_mm if req.target_intrusion_mm is not None else '未设置'} mm",
            f"PDL风险上限: {req.risk_limit_kpa if req.risk_limit_kpa is not None else '未设置'} kPa",
            f"推荐材料: {best['material']}",
            f"推荐设计步距: {best['planned_intrusion_mm']:.4f} mm",
            f"预测17牙真实压低量: {best['Disp_Z_17']:.4f} mm",
            f"预测17牙近远中位移: {best['Disp_X_17']:.4f} mm",
            f"预测PDL应力极值: {best['PDL_max (kPa)']:.4f} kPa",
            f"综合评分: {best['ComprehensiveScore']:.2f}",
            f"曲面位置: {best['surface_position']['rank_label']}",
        ]

        cmds = ['0.14 0.32 0.65 rg', '35 780 525 40 re f', 'BT', '/F1 18 Tf', '1 1 1 rg', '45 794 Td', f"<{uhex('后牙压低逆向推荐报告')}> Tj", 'ET']
        y = 748
        for i, txt in enumerate(lines):
            bg = '0.95 0.97 1.0 rg' if i % 2 == 0 else '1 1 1 rg'
            cmds += [bg, f'35 {y-24} 525 24 re f', '0.75 0.82 0.95 RG', f'35 {y-24} 525 24 re S', 'BT', '/F1 10 Tf', '0.10 0.14 0.20 rg', f'42 {y-17} Td', f"<{uhex(txt[:100])}> Tj", 'ET']
            y -= 24
        stream = '\n'.join(cmds).encode('latin-1')

        objects = [
            b'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
            b'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
            b'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >> endobj',
            b'4 0 obj << /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [5 0 R] >> endobj',
            b'5 0 obj << /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> >> endobj',
            b'6 0 obj << /Length ' + str(len(stream)).encode() + b' >> stream\n' + stream + b'\nendstream endobj',
        ]
        out = b'%PDF-1.4\n'
        offsets = [0]
        for obj in objects:
            offsets.append(len(out))
            out += obj + b'\n'
        xref_pos = len(out)
        out += f"xref\n0 {len(objects)+1}\n".encode()
        out += b'0000000000 65535 f \n'
        for off in offsets[1:]:
            out += f"{off:010d} 00000 n \n".encode()
        out += f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
        return out


recommend_v1_service = RecommendV1Service()
