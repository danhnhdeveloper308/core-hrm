/**
 * Preset bộ OrgUnitType khi tạo Organization mới — org admin có thể
 * thêm/sửa type tuỳ ý sau đó. Cây KHÔNG ép đúng thứ tự rank.
 */
export const ORG_STRUCTURE_PRESETS = {
  /** Công ty đơn: CONG_TY → PHONG_BAN → TO_DOI */
  SINGLE_COMPANY: 'SINGLE_COMPANY',
  /** Tập đoàn sản xuất: TAP_DOAN → KHOI_NGANH → CHUOI → CONG_TY_TV → NHA_MAY → PHONG_BAN → TO_DOI */
  CORPORATION: 'CORPORATION',
} as const;

export type OrgStructurePreset =
  (typeof ORG_STRUCTURE_PRESETS)[keyof typeof ORG_STRUCTURE_PRESETS];

export const ALL_ORG_STRUCTURE_PRESETS = Object.values(ORG_STRUCTURE_PRESETS) as [
  OrgStructurePreset,
  ...OrgStructurePreset[],
];

export interface OrgUnitTypePreset {
  code: string;
  name: string;
  rank: number;
}

export const ORG_PRESET_UNIT_TYPES: Record<OrgStructurePreset, OrgUnitTypePreset[]> = {
  SINGLE_COMPANY: [
    { code: 'CONG_TY', name: 'Công ty', rank: 1 },
    { code: 'PHONG_BAN', name: 'Phòng ban', rank: 2 },
    { code: 'TO_DOI', name: 'Tổ/Đội', rank: 3 },
  ],
  CORPORATION: [
    { code: 'TAP_DOAN', name: 'Tập đoàn', rank: 1 },
    { code: 'KHOI_NGANH', name: 'Khối ngành', rank: 2 },
    { code: 'CHUOI', name: 'Chuỗi', rank: 3 },
    { code: 'CONG_TY_TV', name: 'Công ty thành viên', rank: 4 },
    { code: 'NHA_MAY', name: 'Nhà máy/Tổ hợp', rank: 5 },
    { code: 'PHONG_BAN', name: 'Phòng ban', rank: 6 },
    { code: 'TO_DOI', name: 'Tổ/Đội', rank: 7 },
  ],
};

export const ORG_PRESET_LABELS: Record<OrgStructurePreset, string> = {
  SINGLE_COMPANY: 'Công ty đơn',
  CORPORATION: 'Tập đoàn sản xuất',
};
