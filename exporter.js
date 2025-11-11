(function () {
  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatExportHeaderDate(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}:${pad(date.getSeconds())}`;
  }

  function formatExportFileDate(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) {
      return `${Date.now()}`;
    }
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
      date.getMinutes()
    )}${pad(date.getSeconds())}`;
  }

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function columnLetter(index) {
    let letters = '';
    let num = index + 1;
    while (num > 0) {
      const remainder = (num - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      num = Math.floor((num - 1) / 26);
    }
    return letters;
  }

  function makeCell(colIndex, rowIndex, value, styleId, asNumber) {
    const ref = `${columnLetter(colIndex)}${rowIndex}`;
    let attrs = `r="${ref}"`;
    if (typeof styleId === 'number') {
      attrs += ` s="${styleId}"`;
    }
    const hasNumber = asNumber && value !== '' && value !== null && value !== undefined;
    if (hasNumber) {
      return `<c ${attrs}><v>${value}</v></c>`;
    }
    const text = value === undefined || value === null ? '' : String(value);
    return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
  }

  function buildSheetXml(rows, exportedAt) {
    const exportLabel = formatExportHeaderDate(exportedAt);
    const columns = [
      { key: 'id', title: 'ID' },
      { key: 'title', title: 'Título' },
      { key: 'projectName', title: 'Projeto' },
      { key: 'captureType', title: 'Origem' },
      { key: 'startedAt', title: 'Início' },
      { key: 'endedAt', title: 'Fim' },
      { key: 'durationSeconds', title: 'Duração (s)', numeric: true },
      { key: 'url', title: 'URL' },
    ];

    const headerRowIndex = 2;
    const dataStartIndex = 3;
    const totalRows = rows.length ? dataStartIndex + rows.length - 1 : headerRowIndex;

    const headerCells = columns.map((col, idx) => makeCell(idx, headerRowIndex, col.title, 1, false)).join('');

    const dataRowsXml = rows
      .map((row, rowIdx) => {
        const excelRowIndex = dataStartIndex + rowIdx;
        const styleId = rowIdx % 2 === 0 ? 2 : 3;
        const cells = columns
          .map((col, colIdx) => {
            const value = row[col.key];
            const asNumber = Boolean(col.numeric);
            return makeCell(colIdx, excelRowIndex, value === null ? '' : value, styleId, asNumber);
          })
          .join('');
        return `<row r="${excelRowIndex}" spans="1:${columns.length}">${cells}</row>`;
      })
      .join('');

    const colDefs = [
      { width: 10 },
      { width: 48 },
      { width: 28 },
      { width: 18 },
      { width: 22 },
      { width: 22 },
      { width: 16 },
      { width: 48 },
    ]
      .map((col, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${col.width}" customWidth="1" />`)
      .join('');

    const lastColumnLetter = columnLetter(columns.length - 1);
    const sheetDimension = `A1:${lastColumnLetter}${totalRows}`;
    const autoFilterRef = `A${headerRowIndex}:${lastColumnLetter}${Math.max(headerRowIndex, totalRows)}`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<dimension ref="${sheetDimension}"/>` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>` +
      `<sheetFormatPr baseColWidth="10" defaultRowHeight="15"/>` +
      `<cols>${colDefs}</cols>` +
      `<sheetData>` +
      `<row r="1" spans="1:${columns.length}">${makeCell(0, 1, exportLabel ? `Exportado em: ${exportLabel}` : 'Exportado em:', 0, false)}</row>` +
      `<row r="${headerRowIndex}" spans="1:${columns.length}">${headerCells}</row>` +
      `${dataRowsXml}` +
      `</sheetData>` +
      `<autoFilter ref="${autoFilterRef}"/>` +
      `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
      `</worksheet>`;
  }

  function buildStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2">` +
      `<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>` +
      `</fonts>` +
      `<fills count="4">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="4">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
      `<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`;
  }

  function buildWorkbookXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<fileVersion appName="xl"/>` +
      `<workbookPr/>` +
      `<bookViews><workbookView activeTab="0"/></bookViews>` +
      `<sheets><sheet name="Registros" sheetId="1" r:id="rId1"/></sheets>` +
      `</workbook>`;
  }

  function buildWorkbookRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`;
  }

  function buildRootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
      `</Relationships>`;
  }

  function buildContentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
      `</Types>`;
  }

  function buildCorePropsXml(exportedAt) {
    const stamp = exportedAt || new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>Registros de Tempo</dc:title>` +
      `<dc:creator>Time Tracker</dc:creator>` +
      `<cp:lastModifiedBy>Time Tracker</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(stamp)}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(stamp)}</dcterms:modified>` +
      `</cp:coreProperties>`;
  }

  function buildAppPropsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<Application>Microsoft Excel</Application>` +
      `</Properties>`;
  }

  const textEncoder = new TextEncoder();

  function toUint8Array(text) {
    if (text instanceof Uint8Array) {
      return text;
    }
    return textEncoder.encode(text);
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dateToDos(date) {
    const year = date.getFullYear();
    const safeYear = Math.max(1980, year);
    const dosYear = safeYear - 1980;
    const dosMonth = date.getMonth() + 1;
    const dosDay = date.getDate();
    const dosHour = date.getHours();
    const dosMinute = date.getMinutes();
    const dosSecond = Math.floor(date.getSeconds() / 2);
    const dosTime = (dosHour << 11) | (dosMinute << 5) | dosSecond;
    const dosDate = (dosYear << 9) | (dosMonth << 5) | dosDay;
    return { dosTime, dosDate };
  }

  function createZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    let centralSize = 0;
    const now = new Date();
    const { dosTime, dosDate } = dateToDos(now);

    for (const entry of entries) {
      const nameBytes = toUint8Array(entry.name);
      const dataBytes = toUint8Array(entry.data);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new DataView(new ArrayBuffer(30));
      localHeader.setUint32(0, 0x04034b50, true);
      localHeader.setUint16(4, 20, true);
      localHeader.setUint16(6, 0, true);
      localHeader.setUint16(8, 0, true);
      localHeader.setUint16(10, dosTime, true);
      localHeader.setUint16(12, dosDate, true);
      localHeader.setUint32(14, crc, true);
      localHeader.setUint32(18, size, true);
      localHeader.setUint32(22, size, true);
      localHeader.setUint16(26, nameBytes.length, true);
      localHeader.setUint16(28, 0, true);

      const localBuffer = new Uint8Array(30 + nameBytes.length + size);
      localBuffer.set(new Uint8Array(localHeader.buffer), 0);
      localBuffer.set(nameBytes, 30);
      localBuffer.set(dataBytes, 30 + nameBytes.length);
      localParts.push(localBuffer);

      const centralHeader = new DataView(new ArrayBuffer(46));
      centralHeader.setUint32(0, 0x02014b50, true);
      centralHeader.setUint16(4, 20, true);
      centralHeader.setUint16(6, 20, true);
      centralHeader.setUint16(8, 0, true);
      centralHeader.setUint16(10, 0, true);
      centralHeader.setUint16(12, dosTime, true);
      centralHeader.setUint16(14, dosDate, true);
      centralHeader.setUint32(16, crc, true);
      centralHeader.setUint32(20, size, true);
      centralHeader.setUint32(24, size, true);
      centralHeader.setUint16(28, nameBytes.length, true);
      centralHeader.setUint16(30, 0, true);
      centralHeader.setUint16(32, 0, true);
      centralHeader.setUint16(34, 0, true);
      centralHeader.setUint16(36, 0, true);
      centralHeader.setUint32(38, 0, true);
      centralHeader.setUint32(42, offset, true);

      const centralBuffer = new Uint8Array(46 + nameBytes.length);
      centralBuffer.set(new Uint8Array(centralHeader.buffer), 0);
      centralBuffer.set(nameBytes, 46);
      centralParts.push(centralBuffer);
      centralSize += centralBuffer.length;

      offset += localBuffer.length;
    }

    const endHeader = new DataView(new ArrayBuffer(22));
    endHeader.setUint32(0, 0x06054b50, true);
    endHeader.setUint16(4, 0, true);
    endHeader.setUint16(6, 0, true);
    endHeader.setUint16(8, entries.length, true);
    endHeader.setUint16(10, entries.length, true);
    endHeader.setUint32(12, centralSize, true);
    endHeader.setUint32(16, offset, true);
    endHeader.setUint16(20, 0, true);

    const totalSize = offset + centralSize + endHeader.byteLength;
    const zipData = new Uint8Array(totalSize);
    let pointer = 0;
    for (const part of localParts) {
      zipData.set(part, pointer);
      pointer += part.length;
    }
    for (const part of centralParts) {
      zipData.set(part, pointer);
      pointer += part.length;
    }
    zipData.set(new Uint8Array(endHeader.buffer), pointer);

    return zipData;
  }

  function buildXlsx(rows, exportedAt) {
    return createZip([
      { name: '[Content_Types].xml', data: buildContentTypesXml() },
      { name: '_rels/.rels', data: buildRootRelsXml() },
      { name: 'docProps/app.xml', data: buildAppPropsXml() },
      { name: 'docProps/core.xml', data: buildCorePropsXml(exportedAt) },
      { name: 'xl/workbook.xml', data: buildWorkbookXml() },
      { name: 'xl/_rels/workbook.xml.rels', data: buildWorkbookRelsXml() },
      { name: 'xl/styles.xml', data: buildStylesXml() },
      { name: 'xl/worksheets/sheet1.xml', data: buildSheetXml(rows, exportedAt) },
    ]);
  }

  function downloadXlsx(filename, bytes) {
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const globalTarget = typeof window !== 'undefined' ? window : globalThis;

  globalTarget.ExcelExporter = {
    buildXlsx,
    downloadXlsx,
    formatExportFileDate,
  };
})();
