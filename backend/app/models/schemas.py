from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ConstraintConfig(BaseModel):
    tmj_max: float = Field(4.5, description="TMJ 最大允许应力 MPa")
    pdl_lower_max: float = Field(5.8, description="下前牙 PDL 最大允许应力 kPa")
    pdl_upper_max: float = Field(5.8, description="上前牙 PDL 最大允许应力 kPa")
    max_mp: float = Field(70.0, description="最大前伸比例 %")
    max_vo: float = Field(7.0, description="最大开口量 mm")


class WeightConfig(BaseModel):
    safety: float = 0.45
    effectiveness: float = 0.30
    feasibility: float = 0.20
    balance: float = 0.05


class FormulaConfig(BaseModel):
    mp_gain_gamma: float = Field(1.2, description='MP 治疗效果得分曲线指数，越大越偏好高 MP')
    vo_gain_gamma: float = Field(1.1, description='VO 治疗可行性得分曲线指数，越大越偏好高 VO')
    safety_gamma: float = Field(1.35, description='安全性得分曲线指数，越大对应力超限更敏感')
    tradeoff_strength: float = Field(0.30, description='效果/可行性与安全性冲突时的惩罚强度')
    risk_gamma: float = Field(1.5, description='风险惩罚曲线指数，越大表示高风险区惩罚更陡')


class AnalysisRequest(BaseModel):
    constraints: ConstraintConfig = ConstraintConfig()
    weights: WeightConfig = WeightConfig()
    formulas: FormulaConfig = FormulaConfig()
    selected_mp: float = 60.0
    selected_vo: float = 5.0
    grid_step_mp: float = 1.0
    grid_step_vo: float = 0.25


class ReportRequest(BaseModel):
    analysis: Dict


class InverseRecoInputs(BaseModel):
    alveolar_height: float = Field(..., description='牙槽骨高度（离散仿真高度范围内）')
    target_intrusion_mm: Optional[float] = Field(None, description='希望的真实压低量（17牙，mm）')
    risk_limit_kpa: Optional[float] = Field(None, description='允许的 PDL 应力上限（kPa）')
    score_weights: Optional[Dict[str, float]] = Field(None, description='评分权重：target/risk/side')


class RecommendV1Request(BaseModel):
    inputs: InverseRecoInputs
    search_points: int = 301
    surface_grid_size: int = 42


class RecommendV1Response(BaseModel):
    status: str
    best: Dict[str, Any]
    alternatives: List[Dict[str, Any]]
    charts: Dict[str, Any]
    scoring_formula: Dict[str, Any]
    meta: Dict[str, Any]
