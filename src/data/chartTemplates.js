// Default built-in templates (used to seed Firestore on first load)
export const defaultChartTemplates = [
  { id: 'face-male', name: 'ใบหน้าผู้ชาย', category: 'face', imageUrl: '/chart-templates/face-male.svg', builtIn: true },
  { id: 'face-female', name: 'ใบหน้าผู้หญิง', category: 'face', imageUrl: '/chart-templates/face-female.svg', builtIn: true },
  { id: 'body-front', name: 'ร่างกาย (ด้านหน้า)', category: 'body', imageUrl: '/chart-templates/body-front.svg', builtIn: true },
  { id: 'body-back', name: 'ร่างกาย (ด้านหลัง)', category: 'body', imageUrl: '/chart-templates/body-back.svg', builtIn: true },
  { id: 'teeth', name: 'แผนผังฟัน', category: 'teeth', imageUrl: '/chart-templates/teeth.svg', builtIn: true },
  { id: 'blank', name: 'กระดาษเปล่า', category: 'other', imageUrl: null, builtIn: true },
];

export const chartCategories = [
  { id: 'all', name: 'ทั้งหมด' },
  { id: 'face', name: 'ใบหน้า' },
  { id: 'body', name: 'ร่างกาย' },
  { id: 'teeth', name: 'ฟัน' },
  { id: 'other', name: 'อื่นๆ' },
];
