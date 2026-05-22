import sharp from 'sharp';

export interface DeliveryNoteData {
  shopName: string;
  customerName: string;
  deliveryDate: string;
  staffName: string;
  licensePlate: string;
  deliveryTime: string;
  quantity: number;
  productName: string;
  price: number;
  total: number;
}

export interface SummaryNoteItem {
  deliveryTime: string;
  licensePlate: string;
  staffName: string;
  quantity: number;
  productName: string;
  price: number;
  total: number;
}

export interface SummaryNoteData {
  shopName: string;
  customerName: string;
  deliveryDate: string;
  items: SummaryNoteItem[];
}

export interface SupplierSummaryItem {
  taiRank: number;
  licensePlate: string;
  quantity: number;
  productName: string;
  note?: string;
  senderName: string;
  price: number;
  total: number;
}

export interface SupplierSummaryData {
  shopName?: string;
  supplierName: string;
  date: string;
  items: SupplierSummaryItem[];
}

export interface SenderSummaryItem {
  taiRank: number;
  licensePlate: string;
  quantity: number;
  productName: string;
  supplierName?: string;
  depotName?: string;
}

export interface SenderSummaryData {
  shopName?: string;
  senderName: string;
  date: string;
  items: SenderSummaryItem[];
}

export class DeliveryNoteGenerator {
  private static buildSupplierPriceKey(item: SupplierSummaryItem): string {
    const productName = (item.productName || 'Hàng hóa').trim();
    return `${productName}`;
  }

  private static normalizeSupplierSummaryItems(items: SupplierSummaryItem[]): SupplierSummaryItem[] {
    const normalized = items.map((item) => {
      const quantity = Number(item.quantity || 0);
      let price = Number(item.price || 0);
      let total = Number(item.total || 0);

      if (price > 0 && price < 1000) {
        price *= 1000;
      }

      if (!(price > 0) && quantity > 0 && total > 0) {
        price = total / quantity;
      }

      return {
        ...item,
        quantity,
        price: Math.round(price || 0),
        total: Math.round(total || 0),
      };
    });

    const inferredPriceByProduct = new Map<string, number>();
    const positivePriceSet = new Set<number>();

    normalized.forEach((item) => {
      const price = Number(item.price || 0);
      if (!(price > 0)) return;
      positivePriceSet.add(price);
      const key = this.buildSupplierPriceKey(item);
      if (!inferredPriceByProduct.has(key)) {
        inferredPriceByProduct.set(key, price);
      }
    });

    const fallbackGlobalPrice = positivePriceSet.size === 1
      ? Array.from(positivePriceSet)[0]
      : 0;

    return normalized.map((item) => {
      const quantity = Number(item.quantity || 0);
      let price = Number(item.price || 0);

      if (!(price > 0)) {
        price = Number(inferredPriceByProduct.get(this.buildSupplierPriceKey(item)) || 0);
      }

      if (!(price > 0) && fallbackGlobalPrice > 0) {
        price = fallbackGlobalPrice;
      }

      let total = Number(item.total || 0);
      if (!(total > 0) && quantity > 0 && price > 0) {
        total = quantity * price;
      }

      return {
        ...item,
        quantity,
        price: Math.round(price || 0),
        total: Math.round(total || 0),
      };
    });
  }

  /**
   * Generates a PNG buffer of a delivery note based on SVG template.
   * Matches the user-provided image layout.
   */
  static async generatePng(data: DeliveryNoteData): Promise<Buffer> {
    const width = 800;
    const height = 250;
    const rowHeight = 40;
    const fontSize = 16;
    const boldFontSize = 18;

    // Sanitize data for SVG
    const escapeXml = (unsafe: string) => {
      return unsafe.replace(/[<>&"']/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '"': return '&quot;';
          case "'": return '&apos;';
          default: return c;
        }
      });
    };

    const d = {
      shopName: escapeXml(data.shopName),
      customerName: escapeXml(data.customerName),
      deliveryDate: escapeXml(data.deliveryDate),
      staffName: escapeXml(data.staffName),
      licensePlate: escapeXml(data.licensePlate),
      deliveryTime: escapeXml(data.deliveryTime),
      productName: escapeXml(data.productName),
      quantity: data.quantity,
      price: data.price.toLocaleString('vi-VN'),
      total: data.total.toLocaleString('vi-VN'),
    };

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
        
        <!-- Header -->
        <rect x="10" y="10" width="${width - 20}" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
        <text x="${width / 2}" y="${10 + rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${boldFontSize}" font-weight="bold" text-anchor="middle">
          Phiếu giao hàng Nhà xe ${d.shopName}
        </text>

        <!-- Customer -->
        <rect x="10" y="${10 + rowHeight}" width="${width - 20}" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
        <text x="${width / 2}" y="${10 + rowHeight + rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">
          Khách Hàng : ${d.customerName}
        </text>

        <!-- Date & Staff -->
        <rect x="10" y="${10 + 2 * rowHeight}" width="${(width - 20) / 2}" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
        <text x="20" y="${10 + 2 * rowHeight + rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}">
          Ngày Giao: ${d.deliveryDate}
        </text>

        <rect x="${10 + (width - 20) / 2}" y="${10 + 2 * rowHeight}" width="${(width - 20) / 2}" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
        <text x="${20 + (width - 20) / 2}" y="${10 + 2 * rowHeight + rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}">
          Tên NV: ${d.staffName}
        </text>
        <text x="${width - 20}" y="${10 + 2 * rowHeight + rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="end">
          Xe ${d.licensePlate}
        </text>

        <!-- Table Header -->
        <g transform="translate(10, ${10 + 3 * rowHeight})">
          <rect x="0" y="0" width="100" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="50" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">Giờ Giao</text>

          <rect x="100" y="0" width="100" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="150" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">Số Lượng</text>

          <rect x="200" y="0" width="200" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="300" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">Tên Hàng</text>

          <rect x="400" y="0" width="150" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="475" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">Giá</text>

          <rect x="550" y="0" width="${width - 20 - 550}" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="${550 + (width - 20 - 550) / 2}" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">Thành Tiền</text>
        </g>

        <!-- Table Row -->
        <g transform="translate(10, ${10 + 4 * rowHeight})">
          <rect x="0" y="0" width="100" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="50" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${d.deliveryTime}</text>

          <rect x="100" y="0" width="100" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="150" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${d.quantity}</text>

          <rect x="200" y="0" width="200" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="300" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${d.productName}</text>

          <rect x="400" y="0" width="150" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="475" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${d.price}</text>

          <rect x="550" y="0" width="${width - 20 - 550}" height="${rowHeight}" fill="none" stroke="black" stroke-width="1" />
          <text x="${550 + (width - 20 - 550) / 2}" y="${rowHeight / 2 + 6}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${d.total}</text>
        </g>
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Generates a summary PNG with multiple rows for daily reporting.
   */
  static async generateSummaryPng(data: SummaryNoteData): Promise<Buffer> {
    const width = 1000;
    const rowHeight = 40;
    const headerHeight = 160; // Shop name + Title + Customer + Date info
    const height = headerHeight + (data.items.length + 1) * rowHeight + 20;
    const fontSize = 14;

    const escapeXml = (unsafe: string) => {
      return unsafe.replace(/[<>&"']/g, (c) => {
        switch (c) {
          case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;';
          case '"': return '&quot;'; case "'": return '&apos;'; default: return c;
        }
      });
    };

    const d = {
      shopName: escapeXml(data.shopName),
      customerName: escapeXml(data.customerName),
      deliveryDate: escapeXml(data.deliveryDate),
    };

    let rowsSvg = '';
    data.items.forEach((item, i) => {
      const y = headerHeight + (i + 1) * rowHeight;
      rowsSvg += `
        <g transform="translate(10, ${y})">
          <rect x="0" y="0" width="80" height="${rowHeight}" fill="none" stroke="black" />
          <text x="40" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${escapeXml(item.deliveryTime)}</text>
          
          <rect x="80" y="0" width="100" height="${rowHeight}" fill="none" stroke="black" />
          <text x="130" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${escapeXml(item.licensePlate)}</text>
          
          <rect x="180" y="0" width="180" height="${rowHeight}" fill="none" stroke="black" />
          <text x="190" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}">${escapeXml(item.staffName)}</text>
          
          <rect x="360" y="0" width="100" height="${rowHeight}" fill="none" stroke="black" />
          <text x="410" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="middle">${item.quantity}</text>
          
          <rect x="460" y="0" width="200" height="${rowHeight}" fill="none" stroke="black" />
          <text x="470" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}">${escapeXml(item.productName)}</text>
          
          <rect x="660" y="0" width="150" height="${rowHeight}" fill="none" stroke="black" />
          <text x="800" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="end">${item.price.toLocaleString('vi-VN')}</text>
          
          <rect x="810" y="0" width="${width - 20 - 810}" height="${rowHeight}" fill="none" stroke="black" />
          <text x="${width - 30}" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="${fontSize}" text-anchor="end">${item.total.toLocaleString('vi-VN')}</text>
        </g>
      `;
    });

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
        
        <!-- Header -->
        <rect x="10" y="10" width="${width - 20}" height="40" fill="none" stroke="black" />
        <text x="${width / 2}" y="35" font-family="'DejaVu Sans', sans-serif" font-size="20" font-weight="bold" text-anchor="middle">Nhà xe ${d.shopName}</text>
        
        <rect x="10" y="50" width="${width - 20}" height="40" fill="none" stroke="black" />
        <text x="${width / 2}" y="75" font-family="'DejaVu Sans', sans-serif" font-size="18" font-weight="bold" text-anchor="middle">Phiếu Tổng hàng đã giao trong ngày</text>
        
        <rect x="10" y="90" width="${width - 20}" height="40" fill="none" stroke="black" />
        <text x="${width / 2}" y="115" font-family="'DejaVu Sans', sans-serif" font-size="16" text-anchor="middle">Khách Nhận : ${d.customerName}</text>
        
        <rect x="10" y="130" width="${width - 20}" height="30" fill="none" stroke="black" />
        <text x="${width / 2}" y="150" font-family="'DejaVu Sans', sans-serif" font-size="14" text-anchor="middle">Ngày ${d.deliveryDate}</text>

        <!-- Table Columns -->
        <g transform="translate(10, ${headerHeight})">
          <rect x="0" y="0" width="80" height="${rowHeight}" fill="#f0f0f0" stroke="black" />
          <text x="40" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="bold" text-anchor="middle">giờ giao</text>
          
          <rect x="80" y="0" width="100" height="${rowHeight}" fill="#f0f0f0" stroke="black" />
          <text x="130" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="bold" text-anchor="middle">số xe</text>
          
          <rect x="180" y="0" width="180" height="${rowHeight}" fill="#f0f0f0" stroke="black" />
          <text x="270" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="bold" text-anchor="middle">nhân viên giao</text>
          
          <rect x="360" y="0" width="100" height="${rowHeight}" fill="#f0f0f0" stroke="black" />
          <text x="410" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="bold" text-anchor="middle">số lượng</text>
          
          <rect x="460" y="0" width="200" height="${rowHeight}" fill="#f0f0f0" stroke="black" />
          <text x="560" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="bold" text-anchor="middle">tên hàng</text>
          
          <rect x="660" y="0" width="150" height="${rowHeight}" fill="#f0f0f0" stroke="black" />
          <text x="735" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Giá</text>
          
          <rect x="810" y="0" width="${width - 20 - 810}" height="${rowHeight}" fill="#f0f0f0" stroke="black" />
          <text x="${810 + (width - 20 - 810) / 2}" y="${rowHeight / 2 + 5}" font-family="'DejaVu Sans', sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Thành Tiền</text>
        </g>

        ${rowsSvg}
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Generates supplier summary PNG using the public summary layout.
   */
  static async generateSupplierSummaryPng(data: SupplierSummaryData): Promise<Buffer> {
    const normalizedItems = this.normalizeSupplierSummaryItems(data.items || []);
    const width = 1100;
    const tableX = 25;
    const tableY = 190;
    const tableWidth = 1050;
    const rowHeight = 36;
    const fontSize = 18;
    const boldFontSize = 20;
    const colWidths = [180, 70, 140, 70, 250, 130, 210];
    const totalRows = normalizedItems.length + 2;
    const height = tableY + totalRows * rowHeight + 40;

    const escapeXml = (unsafe: string) => {
      return String(unsafe ?? '').replace(/[<>&"']/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '"': return '&quot;';
          case "'": return '&apos;';
          default: return c;
        }
      });
    };
    const formatNumber = (value: number) => Number(value || 0).toLocaleString('vi-VN');
    const formatProductName = (item: SupplierSummaryItem) => {
      const productName = item.productName || '';
      const note = String(item.note || '').trim();
      return note ? `${productName} (${note})` : productName;
    };

    const xPositions = colWidths.reduce<number[]>((acc, _widthValue, index) => {
      if (index === 0) return [tableX];
      acc.push(acc[index - 1] + colWidths[index - 1]);
      return acc;
    }, []);

    const totalQuantity = normalizedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalMoney = normalizedItems.reduce((sum, item) => sum + (item.total || 0), 0);

    let rowsSvg = '';
    normalizedItems.forEach((item, index) => {
      const y = tableY + (index + 1) * rowHeight;
      const priceK = (item.price || 0) / 1000;
      rowsSvg += `
        <g>
          <rect x="${xPositions[0]}" y="${y}" width="${colWidths[0]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[0] + 8}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}">${escapeXml(item.senderName || '-')}</text>

          <rect x="${xPositions[1]}" y="${y}" width="${colWidths[1]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[1] + colWidths[1] / 2}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="middle">${item.taiRank || ''}</text>

          <rect x="${xPositions[2]}" y="${y}" width="${colWidths[2]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[2] + colWidths[2] / 2}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="middle">${escapeXml(item.licensePlate || '-')}</text>

          <rect x="${xPositions[3]}" y="${y}" width="${colWidths[3]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[3] + colWidths[3] / 2}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="middle">${item.quantity || 0}</text>

          <rect x="${xPositions[4]}" y="${y}" width="${colWidths[4]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[4] + 8}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}">${escapeXml(formatProductName(item))}</text>

          <rect x="${xPositions[5]}" y="${y}" width="${colWidths[5]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[5] + colWidths[5] / 2}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="middle">${formatNumber(priceK)}</text>

          <rect x="${xPositions[6]}" y="${y}" width="${colWidths[6]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[6] + colWidths[6] - 8}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="end">${formatNumber(item.total || 0)}</text>
        </g>
      `;
    });

    const totalY = tableY + (normalizedItems.length + 1) * rowHeight;
    const firstTotalWidth = colWidths[0] + colWidths[1] + colWidths[2];
    rowsSvg += `
      <g>
        <rect x="${xPositions[0]}" y="${totalY}" width="${firstTotalWidth}" height="${rowHeight}" fill="white" stroke="black" />
        <text x="${xPositions[0] + firstTotalWidth - 8}" y="${totalY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="end">Tổng Số Lượng</text>

        <rect x="${xPositions[3]}" y="${totalY}" width="${colWidths[3]}" height="${rowHeight}" fill="white" stroke="black" />
        <text x="${xPositions[3] + colWidths[3] / 2}" y="${totalY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">${formatNumber(totalQuantity)}</text>

        <rect x="${xPositions[4]}" y="${totalY}" width="${colWidths[4]}" height="${rowHeight}" fill="white" stroke="black" />
        <rect x="${xPositions[5]}" y="${totalY}" width="${colWidths[5]}" height="${rowHeight}" fill="white" stroke="black" />

        <rect x="${xPositions[6]}" y="${totalY}" width="${colWidths[6]}" height="${rowHeight}" fill="white" stroke="black" />
        <text x="${xPositions[6] + colWidths[6] - 8}" y="${totalY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="end">${formatNumber(totalMoney)}</text>
      </g>
    `;

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="white" />

        <text x="${width / 2}" y="58" font-family="'Times New Roman', serif" font-size="46" font-weight="bold" text-anchor="middle">${escapeXml(data.shopName || 'Nhà Xe Năm Sự')}</text>
        <text x="${width / 2}" y="100" font-family="'Times New Roman', serif" font-size="40" font-weight="bold" text-anchor="middle">Phiếu Tổng Kết Hàng Đã Nhận</text>

        <text x="${tableX}" y="150" font-family="'Times New Roman', serif" font-size="${boldFontSize}" font-weight="bold">Tên Vựa: ${escapeXml(data.supplierName || '-')}</text>
        <text x="${tableX + tableWidth}" y="150" font-family="'Times New Roman', serif" font-size="${boldFontSize}" font-weight="bold" text-anchor="end">Ngày: ${escapeXml(data.date || '')}</text>

        <rect x="${tableX}" y="${tableY}" width="${tableWidth}" height="${rowHeight}" fill="#f3f4f6" stroke="black" stroke-width="1.5" />
        <text x="${xPositions[0] + 8}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold">Người Gửi</text>
        <text x="${xPositions[1] + colWidths[1] / 2}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">Tài</text>
        <text x="${xPositions[2] + colWidths[2] / 2}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">Số Xe</text>
        <text x="${xPositions[3] + colWidths[3] / 2}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">SL</text>
        <text x="${xPositions[4] + 8}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold">Tên Hàng</text>
        <text x="${xPositions[5] + colWidths[5] / 2}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">Tiền(K)</text>
        <text x="${xPositions[6] + colWidths[6] - 8}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="end">Thành Tiền</text>

        <line x1="${xPositions[1]}" y1="${tableY}" x2="${xPositions[1]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[2]}" y1="${tableY}" x2="${xPositions[2]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[3]}" y1="${tableY}" x2="${xPositions[3]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[4]}" y1="${tableY}" x2="${xPositions[4]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[5]}" y1="${tableY}" x2="${xPositions[5]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[6]}" y1="${tableY}" x2="${xPositions[6]}" y2="${tableY + rowHeight}" stroke="black" />

        ${rowsSvg}
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  /**
   * Generates sender summary PNG using the public summary layout.
   */
  static async generateSenderSummaryPng(data: SenderSummaryData): Promise<Buffer> {
    const width = 1100;
    const tableX = 25;
    const tableY = 190;
    const tableWidth = 1050;
    const rowHeight = 36;
    const fontSize = 18;
    const boldFontSize = 20;
    const colWidths = [300, 70, 140, 70, 470];
    const totalRows = data.items.length + 2;
    const height = tableY + totalRows * rowHeight + 40;

    const escapeXml = (unsafe: string) => {
      return String(unsafe ?? '').replace(/[<>&"']/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '"': return '&quot;';
          case "'": return '&apos;';
          default: return c;
        }
      });
    };
    const formatNumber = (value: number) => Number(value || 0).toLocaleString('vi-VN');

    const xPositions = colWidths.reduce<number[]>((acc, _widthValue, index) => {
      if (index === 0) return [tableX];
      acc.push(acc[index - 1] + colWidths[index - 1]);
      return acc;
    }, []);

    const totalQuantity = data.items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    let rowsSvg = '';
    data.items.forEach((item, index) => {
      const y = tableY + (index + 1) * rowHeight;
      const supplierName = item.supplierName || item.depotName || '-';
      rowsSvg += `
        <g>
          <rect x="${xPositions[0]}" y="${y}" width="${colWidths[0]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[0] + 8}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}">${escapeXml(supplierName)}</text>

          <rect x="${xPositions[1]}" y="${y}" width="${colWidths[1]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[1] + colWidths[1] / 2}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="middle">${item.taiRank || ''}</text>

          <rect x="${xPositions[2]}" y="${y}" width="${colWidths[2]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[2] + colWidths[2] / 2}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="middle">${escapeXml(item.licensePlate || '-')}</text>

          <rect x="${xPositions[3]}" y="${y}" width="${colWidths[3]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[3] + colWidths[3] / 2}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" text-anchor="middle">${item.quantity || 0}</text>

          <rect x="${xPositions[4]}" y="${y}" width="${colWidths[4]}" height="${rowHeight}" fill="white" stroke="black" />
          <text x="${xPositions[4] + 8}" y="${y + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}">${escapeXml(item.productName || '')}</text>
        </g>
      `;
    });

    const totalY = tableY + (data.items.length + 1) * rowHeight;
    const firstTotalWidth = colWidths[0] + colWidths[1] + colWidths[2];
    rowsSvg += `
      <g>
        <rect x="${xPositions[0]}" y="${totalY}" width="${firstTotalWidth}" height="${rowHeight}" fill="white" stroke="black" />
        <text x="${xPositions[0] + firstTotalWidth - 8}" y="${totalY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="end">Tổng Số Lượng</text>

        <rect x="${xPositions[3]}" y="${totalY}" width="${colWidths[3]}" height="${rowHeight}" fill="white" stroke="black" />
        <text x="${xPositions[3] + colWidths[3] / 2}" y="${totalY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">${formatNumber(totalQuantity)}</text>

        <rect x="${xPositions[4]}" y="${totalY}" width="${colWidths[4]}" height="${rowHeight}" fill="white" stroke="black" />
      </g>
    `;

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="white" />

        <text x="${width / 2}" y="58" font-family="'Times New Roman', serif" font-size="46" font-weight="bold" text-anchor="middle">${escapeXml(data.shopName || 'Nhà Xe Năm Sự')}</text>
        <text x="${width / 2}" y="100" font-family="'Times New Roman', serif" font-size="40" font-weight="bold" text-anchor="middle">Phiếu Tổng Kết Hàng Đã Gửi</text>

        <text x="${tableX}" y="150" font-family="'Times New Roman', serif" font-size="${boldFontSize}" font-weight="bold">Người Gửi: ${escapeXml(data.senderName || '-')}</text>
        <text x="${tableX + tableWidth}" y="150" font-family="'Times New Roman', serif" font-size="${boldFontSize}" font-weight="bold" text-anchor="end">Ngày: ${escapeXml(data.date || '')}</text>

        <rect x="${tableX}" y="${tableY}" width="${tableWidth}" height="${rowHeight}" fill="#f3f4f6" stroke="black" stroke-width="1.5" />
        <text x="${xPositions[0] + 8}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold">Tên Vựa</text>
        <text x="${xPositions[1] + colWidths[1] / 2}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">Tài</text>
        <text x="${xPositions[2] + colWidths[2] / 2}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">Số Xe</text>
        <text x="${xPositions[3] + colWidths[3] / 2}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle">SL</text>
        <text x="${xPositions[4] + 8}" y="${tableY + rowHeight / 2 + 6}" font-family="'Times New Roman', serif" font-size="${fontSize}" font-weight="bold">Tên Hàng</text>

        <line x1="${xPositions[1]}" y1="${tableY}" x2="${xPositions[1]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[2]}" y1="${tableY}" x2="${xPositions[2]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[3]}" y1="${tableY}" x2="${xPositions[3]}" y2="${tableY + rowHeight}" stroke="black" />
        <line x1="${xPositions[4]}" y1="${tableY}" x2="${xPositions[4]}" y2="${tableY + rowHeight}" stroke="black" />

        ${rowsSvg}
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }
}
