// Chart template definitions for treatment drawing
export const chartTemplates = [
  { id: 'face-male', name: 'ใบหน้าผู้ชาย', category: 'face', imageUrl: '/chart-templates/face-male.svg' },
  { id: 'face-female', name: 'ใบหน้าผู้หญิง', category: 'face', imageUrl: '/chart-templates/face-female.svg' },
  { id: 'body-front', name: 'ร่างกาย (ด้านหน้า)', category: 'body', imageUrl: '/chart-templates/body-front.svg' },
  { id: 'body-back', name: 'ร่างกาย (ด้านหลัง)', category: 'body', imageUrl: '/chart-templates/body-back.svg' },
  { id: 'teeth', name: 'แผนผังฟัน', category: 'teeth', imageUrl: '/chart-templates/teeth.svg' },
  { id: 'blank', name: 'กระดาษเปล่า', category: 'other', imageUrl: null },
];

export const chartCategories = [
  { id: 'all', name: 'ทั้งหมด' },
  { id: 'face', name: 'ใบหน้า' },
  { id: 'body', name: 'ร่างกาย' },
  { id: 'teeth', name: 'ฟัน' },
  { id: 'other', name: 'อื่นๆ' },
];
