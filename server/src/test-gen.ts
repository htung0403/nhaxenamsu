import { DeliveryNoteGenerator } from './utils/deliveryNoteGenerator';
import fs from 'fs';
import path from 'path';

async function test() {
  const supplierData = {
    supplierName: 'Dũng Hiển',
    date: '15/05/2026',
    items: [
      { taiRank: 2, licensePlate: '49C-12345', quantity: 60, productName: 'Két Cà Chua', senderName: 'Hằng Bên', price: 12000, total: 720000 },
      { taiRank: 2, licensePlate: '49C-12345', quantity: 65, productName: 'Két Cà Chua', senderName: 'Hằng Bên', price: 12000, total: 780000 },
      { taiRank: 3, licensePlate: '49H-78901', quantity: 20, productName: 'Két Cà Chua', senderName: 'Định', price: 12000, total: 240000 },
      { taiRank: 1, licensePlate: '49C-55555', quantity: 10, productName: 'Rau Muống', senderName: 'Lan', price: 8000, total: 80000 },
      { taiRank: 1, licensePlate: '49C-55555', quantity: 15, productName: 'Rau Muống', senderName: 'Huệ', price: 8000, total: 120000 },
    ]
  };

  const senderData = {
    senderName: 'Hằng Bên',
    date: '15/05/2026',
    items: [
      { taiRank: 2, licensePlate: '49C-12345', quantity: 60, productName: 'Két Cà Chua', depotName: 'Dũng Hiển' },
      { taiRank: 2, licensePlate: '49C-12345', quantity: 65, productName: 'Két Cà Chua', depotName: 'Dũng Hiển' },
      { taiRank: 4, licensePlate: '60A-11111', quantity: 30, productName: 'Bầu', depotName: 'Chợ Mới' },
    ]
  };

  try {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const supplierBuffer = await DeliveryNoteGenerator.generateSupplierSummaryPng(supplierData);
    fs.writeFileSync(path.join(tmpDir, 'test-supplier-summary-grouped.png'), supplierBuffer);
    
    const senderBuffer = await DeliveryNoteGenerator.generateSenderSummaryPng(senderData);
    fs.writeFileSync(path.join(tmpDir, 'test-sender-summary-grouped.png'), senderBuffer);
    
    console.log('Saved test images to tmp folder');
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
