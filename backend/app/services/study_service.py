from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures

from app.models.schemas import AnalysisRequest


@dataclass
class FitModel:
    name: str
    pipeline: Pipeline
    min_value: float
    max_value: float
    r2: float

    def predict(self, mp, vo):
        x = np.column_stack([np.asarray(mp).reshape(-1), np.asarray(vo).reshape(-1)])
        return self.pipeline.predict(x)


class StudyService:
    def __init__(self):
        base_dir = Path(__file__).resolve().parents[2]
        configured = os.getenv('STUDY_DATA_XLSX_PATH', '').strip()
        if configured:
            p = Path(configured).expanduser()
            self.data_path = p if p.is_absolute() else base_dir / p
        else:
            self.data_path = base_dir / 'data' / '关节盘及牙齿应力数据.xlsx'

        self.ready = self.data_path.exists()
        if self.ready:
            self.raw_df = self._load_raw_data()
            self.models = self._fit_models()
            self.meta = self._build_meta()
        else:
            self.raw_df = pd.DataFrame()
            self.models = {}
            self.meta = {
                'study_name': 'MAD 生物力学交互式设计工具 V2',
                'data_file': str(self.data_path),
                'status': 'disabled',
                'message': 'study 数据文件不存在；如需启用 /study 接口，请配置 STUDY_DATA_XLSX_PATH 或补充数据文件。',
            }

    def _load_raw_data(self) -> pd.DataFrame:
        if not self.data_path.exists():
            raise FileNotFoundError(f'未找到数据文件: {self.data_path}')

        xls = pd.ExcelFile(self.data_path)
        sheet = '原始数据' if '原始数据' in xls.sheet_names else xls.sheet_names[0]
        df = pd.read_excel(self.data_path, sheet_name=sheet)

        rename_map = {
            '下颌前伸量 /%': 'mp',
            '垂直开口量 /mm': 'vo',
            '关节盘应力最大值 /MPa': 'tmj',
            '下前牙PDL应力最大值/kPa': 'pdl_lower',
            '上前牙PDL应力最大值/kPa': 'pdl_upper',
            '（左侧）关节盘应力最大值 /MPa': 'tmj_left',
            '（右侧）关节盘应力最大值 /MPa': 'tmj_right',
        }
        df = df.rename(columns=rename_map)
        required_cols = ['mp', 'vo', 'tmj', 'pdl_lower', 'pdl_upper']
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            raise ValueError(f'数据列缺失: {missing}')
        return df

    def _fit_single_model(self, target: str) -> FitModel:
        x = self.raw_df[['mp', 'vo']].values
        y = self.raw_df[target].values
        pipe = Pipeline([
            ('poly', PolynomialFeatures(degree=2, include_bias=True)),
            ('reg', LinearRegression()),
        ])
        pipe.fit(x, y)
        return FitModel(
            name=target,
            pipeline=pipe,
            min_value=float(np.min(y)),
            max_value=float(np.max(y)),
            r2=float(pipe.score(x, y)),
        )

    def _fit_models(self) -> Dict[str, FitModel]:
        return {
            'tmj': self._fit_single_model('tmj'),
            'pdl_lower': self._fit_single_model('pdl_lower'),
            'pdl_upper': self._fit_single_model('pdl_upper'),
        }

    def _build_meta(self):
        return {
            'study_name': 'MAD 生物力学交互式设计工具 V2',
            'data_file': self.data_path.name,
            'fit_stats': {
                name: {'r2': model.r2, 'min': model.min_value, 'max': model.max_value}
                for name, model in self.models.items()
            },
            'parameter_ranges': {'mp': [50, 70], 'vo': [3, 7]},
            'defaults': {
                'selected_mp': 60,
                'selected_vo': 5,
                'constraints': {
                    'tmj_max': 4.5,
                    'pdl_lower_max': 5.8,
                    'pdl_upper_max': 5.8,
                    'max_mp': 70,
                    'max_vo': 7,
                },
                'weights': {
                    'safety': 0.45,
                    'effectiveness': 0.30,
                    'feasibility': 0.20,
                    'balance': 0.05,
                },
                'formulas': {
                    'mp_gain_gamma': 1.2,
                    'vo_gain_gamma': 1.1,
                    'safety_gamma': 1.35,
                    'tradeoff_strength': 0.30,
                    'risk_gamma': 1.5,
                },
            },
        }

    def _ensure_ready(self):
        if not self.ready:
            raise RuntimeError(f"study 服务未启用：{self.meta.get('message')}")

    def get_meta(self):
        return self.meta

    def get_raw_records(self):
        self._ensure_ready()
        return self.raw_df.to_dict(orient='records')

    def _predict_frame(self, mp_values: np.ndarray, vo_values: np.ndarray) -> pd.DataFrame:
        mp_grid, vo_grid = np.meshgrid(mp_values, vo_values)
        flat_mp = mp_grid.reshape(-1)
        flat_vo = vo_grid.reshape(-1)
        return pd.DataFrame({
            'mp': flat_mp,
            'vo': flat_vo,
            'tmj': self.models['tmj'].predict(flat_mp, flat_vo),
            'pdl_lower': self.models['pdl_lower'].predict(flat_mp, flat_vo),
            'pdl_upper': self.models['pdl_upper'].predict(flat_mp, flat_vo),
        })

    @staticmethod
    def _minmax_positive(x: pd.Series) -> pd.Series:
        return np.clip((x - x.min()) / max(float(x.max() - x.min()), 1e-9), 0, 1)

    @staticmethod
    def _safe_score(value: pd.Series) -> pd.Series:
        return 1 - StudyService._minmax_positive(value)

    @staticmethod
    def _limiting_factor(row):
        factors = []
        if row['constraint_tmj']:
            factors.append('关节盘应力')
        if row['constraint_pdl_lower']:
            factors.append('下前牙PDL')
        if row['constraint_pdl_upper']:
            factors.append('上前牙PDL')
        if row['constraint_mp']:
            factors.append('前伸比例')
        if row['constraint_vo']:
            factors.append('开口量')
        return 'OK' if not factors else ' / '.join(factors)

    def _apply_scoring(self, df: pd.DataFrame, req: AnalysisRequest) -> pd.DataFrame:
        c = req.constraints
        w = req.weights
        f = req.formulas
        df = df.copy()

        df['score_tmj_minmax'] = np.power(self._safe_score(df['tmj']), f.safety_gamma)
        df['score_pdl_lower_minmax'] = np.power(self._safe_score(df['pdl_lower']), f.safety_gamma)
        df['score_pdl_upper_minmax'] = np.power(self._safe_score(df['pdl_upper']), f.safety_gamma)

        df['score_effectiveness'] = np.power(self._minmax_positive(df['mp']), f.mp_gain_gamma)
        df['score_feasibility'] = np.power(self._minmax_positive(df['vo']), f.vo_gain_gamma)
        df['score_balance'] = 1 - np.clip(np.abs(df['pdl_lower'] - df['pdl_upper']) / 3.0, 0, 1)

        df['score_safety'] = (df['score_tmj_minmax'] + df['score_pdl_lower_minmax'] + df['score_pdl_upper_minmax']) / 3
        df['risk_index'] = 1 - df['score_safety']
        df['drive_index'] = (df['score_effectiveness'] + df['score_feasibility']) / 2
        df['score_tradeoff_penalty'] = f.tradeoff_strength * df['drive_index'] * np.power(df['risk_index'], f.risk_gamma)

        df['overall_score'] = (
            w.safety * df['score_safety']
            + w.effectiveness * df['score_effectiveness']
            + w.feasibility * df['score_feasibility']
            + w.balance * df['score_balance']
            - df['score_tradeoff_penalty']
        )

        df['constraint_tmj'] = df['tmj'] > c.tmj_max
        df['constraint_pdl_lower'] = df['pdl_lower'] > c.pdl_lower_max
        df['constraint_pdl_upper'] = df['pdl_upper'] > c.pdl_upper_max
        df['constraint_mp'] = df['mp'] > c.max_mp
        df['constraint_vo'] = df['vo'] > c.max_vo
        violation_cols = ['constraint_tmj', 'constraint_pdl_lower', 'constraint_pdl_upper', 'constraint_mp', 'constraint_vo']
        df['violation_count'] = df[violation_cols].sum(axis=1)
        df['is_feasible'] = df['violation_count'] == 0
        df['limiting_factor'] = df.apply(self._limiting_factor, axis=1)
        return df

    def _top_candidates(self, df: pd.DataFrame, count=3):
        feasible = df[df['is_feasible']].sort_values(['overall_score', 'score_safety'], ascending=False)
        if feasible.empty:
            return []
        return feasible.drop_duplicates(subset=['mp', 'vo']).head(count).to_dict(orient='records')

    def _selected_snapshot(self, df: pd.DataFrame, req: AnalysisRequest):
        target = df[(np.isclose(df['mp'], req.selected_mp)) & (np.isclose(df['vo'], req.selected_vo))]
        if target.empty:
            target = df.assign(distance=(df['mp'] - req.selected_mp) ** 2 + (df['vo'] - req.selected_vo) ** 2).sort_values('distance').head(1)
        return target.iloc[0].to_dict()

    def _best_recommendation(self, df: pd.DataFrame) -> Dict:
        feasible = df[df['is_feasible']].sort_values(['overall_score', 'score_safety'], ascending=False)
        if not feasible.empty:
            return feasible.iloc[0].to_dict()
        return df.sort_values(['overall_score', 'score_safety'], ascending=False).iloc[0].to_dict()

    def analyze(self, req: AnalysisRequest):
        self._ensure_ready()
        mp_values = np.arange(50, req.constraints.max_mp + 1e-9, req.grid_step_mp)
        vo_values = np.arange(3, req.constraints.max_vo + 1e-9, req.grid_step_vo)
        grid = self._apply_scoring(self._predict_frame(mp_values, vo_values), req)
        selected = self._selected_snapshot(grid, req)
        candidates = self._top_candidates(grid, 3)

        pareto_source = grid[['mp', 'vo', 'tmj', 'pdl_lower', 'overall_score', 'is_feasible']].copy()
        pareto_source['effectiveness_proxy'] = pareto_source['mp']

        return {
            'meta': self.meta,
            'selected': selected,
            'recommended': self._best_recommendation(grid),
            'candidates': candidates,
            'grid': grid.round(4).to_dict(orient='records'),
            'raw_records': self.get_raw_records(),
            'pareto_records': pareto_source.round(4).to_dict(orient='records'),
            'interpretation': self._build_interpretation(selected, candidates),
        }

    def _build_interpretation(self, selected: Dict, candidates: List[Dict]) -> Dict:
        status = '可行' if selected.get('is_feasible') else '受限'
        selected_text = (
            f"当前点 MP {selected['mp']:.1f}% / VO {selected['vo']:.2f} mm，"
            f"整体评分 {selected['overall_score']:.3f}，状态为{status}。"
            f"TMJ {selected['tmj']:.2f} MPa，下前牙 PDL {selected['pdl_lower']:.2f} kPa，"
            f"上前牙 PDL {selected['pdl_upper']:.2f} kPa。"
        )
        advice = '当前点未触发硬约束，可以作为可讨论方案。' if selected.get('is_feasible') else f"当前点受限，主要限制因子为：{selected['limiting_factor']}。"
        best_text = (
            f"当前推荐优先点为 MP {candidates[0]['mp']:.1f}% / VO {candidates[0]['vo']:.2f} mm，评分 {candidates[0]['overall_score']:.3f}。"
            if candidates else '当前阈值下不存在可行点，建议放宽约束或缩小目标范围。'
        )
        return {'selected_text': selected_text, 'advice': advice, 'best_text': best_text}

    def build_report(self, req):
        self._ensure_ready()
        analysis = req.analysis
        selected = analysis['selected']
        candidates = analysis.get('candidates', [])
        lines = [
            '# MAD 生物力学设计报告',
            '',
            '## 当前方案',
            f"- MP: {selected['mp']:.1f}%",
            f"- VO: {selected['vo']:.2f} mm",
            f"- 综合评分: {selected['overall_score']:.3f}",
            f"- TMJ: {selected['tmj']:.2f} MPa",
            f"- 下前牙 PDL: {selected['pdl_lower']:.2f} kPa",
            f"- 上前牙 PDL: {selected['pdl_upper']:.2f} kPa",
            f"- 可行性: {'可行' if selected['is_feasible'] else '受限'}",
            f"- 限制因子: {selected['limiting_factor']}",
            '',
            '## 拟合与评分说明',
            f'- 数据源：{self.data_path}（离散实验点）。',
            '- 拟合：二次多项式回归（tmj、pdl_lower、pdl_upper）。',
            '- 评分：MP 越大越好、VO 越大越好、应力越小越好。通过可调公式引入“高推进-高风险”惩罚，实现非单调权衡。',
            '',
            '## 推荐方案',
        ]
        if candidates:
            for idx, c in enumerate(candidates, 1):
                lines.extend([
                    f"### 备选 {idx}",
                    f"- MP {c['mp']:.1f}% / VO {c['vo']:.2f} mm",
                    f"- 综合评分 {c['overall_score']:.3f}",
                    f"- TMJ {c['tmj']:.2f} MPa，PDL下 {c['pdl_lower']:.2f} kPa，PDL上 {c['pdl_upper']:.2f} kPa",
                    '',
                ])
        else:
            lines.append('- 当前没有满足阈值的可行候选点。')
        return '\n'.join(lines)


study_service = StudyService()
