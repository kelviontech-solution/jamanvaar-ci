/**
 * Demo tables in the repository's starter data once carried fixed QR tokens. Anyone can read them, so they must never work as
 * a real restaurant's QR code, whichever restaurant's device happens to push those demo tables. They are refused by the
 * legacy mirror and revoked by migration 20260927010000.
 */
export const PUBLISHED_DEMO_QR_TOKENS: ReadonlySet<string> = new Set([
  'jv_qr_tbl_10_37eca09743ef58161acd9e4673bcf0a819d2',
  'jv_qr_tbl_11_48fdb10854fa69272bde0f5784cda1b92ae3',
  'jv_qr_tbl_12_59aec21965ab7a383cef106895deb2ca3bf4',
  'jv_qr_tbl_1_a8f3d10e54b6c927e1f40b5d8a23c719e04f',
  'jv_qr_tbl_2_b9c4e21f65c7d038f2a51c6e9b34d820f15a',
  'jv_qr_tbl_3_c0d5f32076d8e149a3b62d7f0c45e931a26b',
  'jv_qr_tbl_4_d1e6a43187e9f250b4c73e801d56fa42b37c',
  'jv_qr_tbl_5_e2f7b54298fa0361c5d84f912e67ab53c48d',
  'jv_qr_tbl_6_f3a8c65309ab1472d6e95a023f78bc64d59e',
  'jv_qr_tbl_7_04b9d76410bc2583e7fa6b134089cd75e6af',
  'jv_qr_tbl_8_15cae87521cd3694f8ab7c24519ade86f7b0',
  'jv_qr_tbl_9_26dbf98632de470509bc8d3562abef9708c1'
]);
