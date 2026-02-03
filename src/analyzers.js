// Helper functions
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function pxToMm(px, dpi) {
  return Math.round((px / dpi) * 25.4 * 10) / 10;
}

// Minimum font size for newspaper print legibility (in points)
const MIN_FONT_SIZE_NEWSPAPER = 6;

// PDF Analyzer
function analyzePDF(buffer, fileName) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const text = bytes.toString('latin1');

  // Find MediaBox for dimensions
  let width = 595;  // Default A4
  let height = 842;
  const mediaBoxMatch = text.match(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/);
  if (mediaBoxMatch) {
    width = Math.abs(parseFloat(mediaBoxMatch[3]) - parseFloat(mediaBoxMatch[1]));
    height = Math.abs(parseFloat(mediaBoxMatch[4]) - parseFloat(mediaBoxMatch[2]));
  }

  // Convert points to mm (1 point = 0.352778 mm)
  const widthMm = Math.round(width * 0.352778 * 10) / 10;
  const heightMm = Math.round(height * 0.352778 * 10) / 10;

  // Detect color space
  let colorSpace = 'unknown';
  if (text.includes('/DeviceCMYK') || (text.includes('/ICCBased') && text.includes('CMYK'))) {
    colorSpace = 'CMYK';
  } else if (text.includes('/DeviceRGB')) {
    colorSpace = 'RGB';
  } else if (text.includes('/DeviceGray')) {
    colorSpace = 'Grayscale';
  }

  // Detect ICC Profile
  let hasICCProfile = false;
  let iccProfile = undefined;
  if (text.includes('/ICCBased') || text.includes('/OutputIntent')) {
    hasICCProfile = true;
    if (text.includes('ISONewspaper') || text.includes('ISOnewspaper')) {
      iccProfile = 'ISONewspaper';
    } else if (text.includes('Eurostandard') || text.includes('EuroStandard')) {
      iccProfile = 'Euroestándar';
    } else if (text.includes('sRGB')) {
      iccProfile = 'sRGB';
    } else if (text.includes('AdobeRGB')) {
      iccProfile = 'Adobe RGB';
    }
  }

  // Analyze text readability for newspaper print
  let textReadability = { isLegible: true, status: 'legible', details: [], minFontSize: null };

  // Search for font size definitions in PDF (Tf operator: fontSize fontName Tf)
  const fontSizeMatches = text.match(/(\d+\.?\d*)\s+Tf/g);
  const fontSizes = [];
  if (fontSizeMatches) {
    fontSizeMatches.forEach(match => {
      const size = parseFloat(match.match(/(\d+\.?\d*)/)[1]);
      if (size > 0 && size < 200) { // Reasonable font size range
        fontSizes.push(size);
      }
    });
  }

  // Also check for /FontSize entries
  const fontSizeEntries = text.match(/\/FontSize\s+(\d+\.?\d*)/g);
  if (fontSizeEntries) {
    fontSizeEntries.forEach(match => {
      const size = parseFloat(match.match(/(\d+\.?\d*)/)[1]);
      if (size > 0 && size < 200) {
        fontSizes.push(size);
      }
    });
  }

  if (fontSizes.length > 0) {
    const minSize = Math.min(...fontSizes);
    textReadability.minFontSize = Math.round(minSize * 10) / 10;

    if (minSize < MIN_FONT_SIZE_NEWSPAPER) {
      textReadability.isLegible = false;
      textReadability.status = 'no-legible';
      textReadability.details.push(`Tamaño mínimo detectado: ${textReadability.minFontSize}pt (mínimo recomendado: ${MIN_FONT_SIZE_NEWSPAPER}pt)`);
    } else {
      textReadability.details.push(`Tamaño mínimo detectado: ${textReadability.minFontSize}pt`);
    }
  } else {
    textReadability.status = 'unknown';
    textReadability.details.push('No se detectaron definiciones de tamaño de fuente');
  }

  // Build printability analysis
  const issues = [];
  const recommendations = [];

  if (colorSpace === 'RGB') {
    issues.push('El archivo está en RGB, se requiere conversión a CMYK');
    recommendations.push('Convertir a CMYK con perfil ISONewspaper o Euroestándar');
  } else if (colorSpace === 'unknown') {
    issues.push('No se pudo detectar el espacio de color');
  }

  if (!hasICCProfile) {
    issues.push('No se detectó perfil ICC embebido');
    recommendations.push('Se recomienda embeber perfil ISONewspaper para impresión en papel prensa');
  } else if (iccProfile && !['ISONewspaper', 'Euroestándar'].includes(iccProfile)) {
    issues.push(`Perfil ICC "${iccProfile}" no es óptimo para papel prensa`);
    recommendations.push('Convertir a perfil ISONewspaper o Euroestándar');
  }

  // Add text readability issues
  if (!textReadability.isLegible) {
    issues.push('Texto con tamaño insuficiente para impresión en papel prensa');
    recommendations.push(`Aumentar tamaño de fuente a mínimo ${MIN_FONT_SIZE_NEWSPAPER}pt para garantizar legibilidad`);
  }

  let status = 'ready';
  if (colorSpace === 'RGB' || colorSpace === 'unknown') {
    status = 'error';
  } else if (!textReadability.isLegible) {
    status = 'warning';
  } else if (issues.length > 0) {
    status = 'warning';
  }

  if (recommendations.length === 0 && status === 'ready') {
    recommendations.push('Archivo listo para impresión en papel prensa');
  }

  return {
    fileName,
    fileType: 'PDF',
    fileSize: formatFileSize(bytes.length),
    dimensions: {
      width: widthMm,
      height: heightMm,
      unit: 'mm'
    },
    resolution: {
      value: 300,
      status: 'default',
      message: 'PDF - resolución estimada por defecto'
    },
    colorSpace,
    hasICCProfile,
    iccProfile,
    textReadability,
    printability: { status, issues },
    recommendations
  };
}

// JPG Analyzer
function analyzeJPG(buffer, fileName) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let width = 0;
  let height = 0;
  let dpiX = 72;
  let dpiY = 72;
  let colorSpace = 'RGB';
  let hasICCProfile = false;
  let iccProfile = undefined;
  let dpiDetected = false;

  let offset = 0;

  // Check JPEG signature
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    throw new Error('Archivo JPG inválido');
  }

  offset = 2;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xFF) {
      offset++;
      continue;
    }

    const marker = bytes[offset + 1];

    if (marker === 0xD9) break; // EOI

    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      offset += 2;
      continue;
    }

    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];

    // APP0 - JFIF
    if (marker === 0xE0) {
      const jfifId = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (jfifId === 'JFIF') {
        const units = bytes[offset + 11];
        dpiX = (bytes[offset + 12] << 8) | bytes[offset + 13];
        dpiY = (bytes[offset + 14] << 8) | bytes[offset + 15];

        if (units === 1) {
          dpiDetected = true;
        } else if (units === 2) {
          dpiX = Math.round(dpiX * 2.54);
          dpiY = Math.round(dpiY * 2.54);
          dpiDetected = true;
        }
      }
    }

    // APP1 - EXIF
    if (marker === 0xE1) {
      const exifId = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (exifId === 'Exif') {
        const tiffOffset = offset + 10;
        const byteOrder = (bytes[tiffOffset] << 8) | bytes[tiffOffset + 1];
        const littleEndian = byteOrder === 0x4949;

        const readUint16 = (pos) => {
          return littleEndian
            ? bytes[pos] | (bytes[pos + 1] << 8)
            : (bytes[pos] << 8) | bytes[pos + 1];
        };

        const readUint32 = (pos) => {
          return littleEndian
            ? bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)
            : (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
        };

        try {
          const ifdOffset = readUint32(tiffOffset + 4);
          const numEntries = readUint16(tiffOffset + ifdOffset);

          let exifDpiX = null;
          let exifDpiY = null;
          let exifResolutionUnit = 2; // Default: inches

          // Primera pasada: leer todos los tags necesarios
          for (let i = 0; i < numEntries; i++) {
            const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
            const tag = readUint16(entryOffset);

            if (tag === 296) { // ResolutionUnit
              exifResolutionUnit = readUint16(entryOffset + 8);
            } else if (tag === 282 || tag === 283) { // XResolution / YResolution
              const valueOffset = readUint32(entryOffset + 8);
              const numerator = readUint32(tiffOffset + valueOffset);
              const denominator = readUint32(tiffOffset + valueOffset + 4);
              if (denominator > 0 && numerator > 0) {
                const resolution = numerator / denominator;
                if (tag === 282) exifDpiX = resolution;
                else exifDpiY = resolution;
              }
            }
          }

          // Aplicar conversión de unidades y validar
          if (exifDpiX !== null || exifDpiY !== null) {
            // Convertir de cm a inches si es necesario (unit 3 = centimeters)
            if (exifResolutionUnit === 3) {
              if (exifDpiX !== null) exifDpiX = exifDpiX * 2.54;
              if (exifDpiY !== null) exifDpiY = exifDpiY * 2.54;
            }

            // Solo usar valores EXIF si son razonables (entre 1 y 10000 dpi)
            // y si no tenemos ya valores detectados de JFIF
            if (!dpiDetected) {
              if (exifDpiX !== null && exifDpiX >= 1 && exifDpiX <= 10000) {
                dpiX = Math.round(exifDpiX);
                dpiDetected = true;
              }
              if (exifDpiY !== null && exifDpiY >= 1 && exifDpiY <= 10000) {
                dpiY = Math.round(exifDpiY);
                dpiDetected = true;
              }
            }
          }
        } catch (e) {
          // EXIF parsing failed, continue with JFIF values if available
        }
      }
    }

    // APP2 - ICC Profile
    if (marker === 0xE2) {
      const iccId = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7],
        bytes[offset + 8], bytes[offset + 9], bytes[offset + 10], bytes[offset + 11]
      );
      if (iccId.startsWith('ICC_PROF')) {
        hasICCProfile = true;
        const profileData = bytes.slice(offset + 18, offset + 2 + segmentLength).toString('latin1');
        if (profileData.includes('ISONewspaper') || profileData.includes('ISOnewspaper')) {
          iccProfile = 'ISONewspaper';
        } else if (profileData.includes('Eurostandard') || profileData.includes('EuroStandard')) {
          iccProfile = 'Euroestándar';
        } else if (profileData.includes('sRGB')) {
          iccProfile = 'sRGB';
        } else if (profileData.includes('AdobeRGB') || profileData.includes('Adobe RGB')) {
          iccProfile = 'Adobe RGB';
        } else if (profileData.includes('CMYK')) {
          iccProfile = 'CMYK Profile';
        }
      }
    }

    // APP13 - Photoshop (8BIM resources with Resolution Info)
    if (marker === 0xED && !dpiDetected) {
      const psId = String.fromCharCode(
        bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7],
        bytes[offset + 8], bytes[offset + 9], bytes[offset + 10], bytes[offset + 11],
        bytes[offset + 12], bytes[offset + 13]
      );
      if (psId.startsWith('Photoshop')) {
        const segmentData = bytes.slice(offset + 4, offset + 2 + segmentLength);
        let pos = 0;

        // Search for 8BIM resources
        while (pos < segmentData.length - 12) {
          // Look for "8BIM" signature
          if (segmentData[pos] === 0x38 && segmentData[pos + 1] === 0x42 &&
              segmentData[pos + 2] === 0x49 && segmentData[pos + 3] === 0x4D) {

            const resourceId = (segmentData[pos + 4] << 8) | segmentData[pos + 5];

            // Resource ID 0x03ED (1005) = Resolution Info
            if (resourceId === 0x03ED) {
              // Skip pascal string name (1 byte length + string + padding to even)
              const nameLen = segmentData[pos + 6] || 0;
              const paddedNameLen = nameLen + (nameLen % 2 === 0 ? 1 : 0) + 1;
              const dataStart = pos + 6 + paddedNameLen;

              if (dataStart + 8 <= segmentData.length) {
                // hRes is Fixed 16.16 format (4 bytes)
                const hResRaw = (segmentData[dataStart + 4] << 24) |
                                (segmentData[dataStart + 5] << 16) |
                                (segmentData[dataStart + 6] << 8) |
                                segmentData[dataStart + 7];
                const hRes = hResRaw / 65536;

                // hResUnit: 1 = pixels/inch, 2 = pixels/cm
                const hResUnit = (segmentData[dataStart + 8] << 8) | segmentData[dataStart + 9];

                // vRes is at offset +10 (4 bytes Fixed 16.16)
                if (dataStart + 14 <= segmentData.length) {
                  const vResRaw = (segmentData[dataStart + 10] << 24) |
                                  (segmentData[dataStart + 11] << 16) |
                                  (segmentData[dataStart + 12] << 8) |
                                  segmentData[dataStart + 13];
                  const vRes = vResRaw / 65536;

                  if (hRes >= 1 && hRes <= 10000) {
                    dpiX = hResUnit === 2 ? Math.round(hRes * 2.54) : Math.round(hRes);
                    dpiDetected = true;
                  }
                  if (vRes >= 1 && vRes <= 10000) {
                    dpiY = hResUnit === 2 ? Math.round(vRes * 2.54) : Math.round(vRes);
                    dpiDetected = true;
                  }
                }
              }
              break; // Found resolution info, stop searching
            }

            // Move to next 8BIM resource
            const nLen = segmentData[pos + 6] || 0;
            const pLen = nLen + (nLen % 2 === 0 ? 1 : 0) + 1;
            const dStart = pos + 6 + pLen;
            if (dStart + 4 > segmentData.length) break;
            const dSize = (segmentData[dStart] << 24) | (segmentData[dStart + 1] << 16) |
                          (segmentData[dStart + 2] << 8) | segmentData[dStart + 3];
            const padding = dSize % 2;
            pos = dStart + 4 + dSize + padding;
          } else {
            pos++;
          }
        }
      }
    }

    // SOF markers (Start of Frame)
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      const components = bytes[offset + 9];

      if (components === 1) {
        colorSpace = 'Grayscale';
      } else if (components === 3) {
        colorSpace = 'RGB';
      } else if (components === 4) {
        colorSpace = 'CMYK';
      }
    }

    offset += 2 + segmentLength;
  }

  const dpi = Math.max(dpiX, dpiY);

  // Analyze text readability for raster images
  // For raster images, readability depends on resolution
  // Text in images below 200 dpi will likely not be legible in newspaper print
  let textReadability = { isLegible: true, status: 'legible', details: [] };

  if (dpi < 150) {
    textReadability.isLegible = false;
    textReadability.status = 'no-legible';
    textReadability.details.push(`Resolución de ${dpi} dpi es insuficiente para texto legible`);
    textReadability.details.push('El texto en la imagen probablemente no se leerá correctamente');
  } else if (dpi < 200) {
    textReadability.status = 'warning';
    textReadability.details.push(`Resolución de ${dpi} dpi puede afectar la legibilidad del texto`);
  } else {
    textReadability.details.push(`Resolución de ${dpi} dpi es adecuada para texto legible`);
  }

  // Build printability analysis
  const issues = [];
  const recommendations = [];

  if (dpi < 200) {
    issues.push(`Resolución de ${dpi} dpi es inferior al mínimo de 200 dpi`);
    recommendations.push('Redimensionar imagen o usar una versión de mayor resolución');
  }

  if (colorSpace === 'RGB') {
    issues.push('El archivo está en RGB, se recomienda convertir a CMYK');
    recommendations.push('Convertir a CMYK con perfil ISONewspaper o Euroestándar');
  }

  if (!hasICCProfile) {
    issues.push('No se detectó perfil ICC embebido');
    recommendations.push('Se recomienda embeber perfil ICC apropiado');
  } else if (iccProfile && !['ISONewspaper', 'Euroestándar', 'CMYK Profile'].includes(iccProfile)) {
    issues.push(`Perfil ICC "${iccProfile}" no es óptimo para papel prensa`);
    recommendations.push('Convertir a perfil ISONewspaper o Euroestándar');
  }

  // Add text readability warning if needed
  if (!textReadability.isLegible) {
    issues.push('Resolución insuficiente para texto legible en impresión');
  }

  let status = 'ready';
  if (dpi < 200) {
    status = 'error';
  } else if (colorSpace === 'RGB' || issues.length > 0) {
    status = 'warning';
  }

  if (recommendations.length === 0 && status === 'ready') {
    recommendations.push('Archivo listo para impresión en papel prensa');
  }

  return {
    fileName,
    fileType: 'JPG',
    fileSize: formatFileSize(bytes.length),
    dimensions: {
      width,
      height,
      unit: 'px'
    },
    physicalDimensions: dpiDetected ? {
      width: pxToMm(width, dpi),
      height: pxToMm(height, dpi),
      unit: 'mm'
    } : undefined,
    resolution: {
      value: dpi,
      status: dpiDetected ? 'detected' : 'default',
      message: dpiDetected ? undefined : 'Resolución no detectada, usando 72 dpi por defecto'
    },
    colorSpace,
    hasICCProfile,
    iccProfile,
    textReadability,
    printability: { status, issues },
    recommendations
  };
}

// TIFF Analyzer
function analyzeTIFF(buffer, fileName) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // Check byte order
  const byteOrder = (bytes[0] << 8) | bytes[1];
  const littleEndian = byteOrder === 0x4949;

  const readUint16 = (pos) => {
    return littleEndian
      ? bytes[pos] | (bytes[pos + 1] << 8)
      : (bytes[pos] << 8) | bytes[pos + 1];
  };

  const readUint32 = (pos) => {
    return littleEndian
      ? bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)
      : (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
  };

  // Check TIFF magic number
  const magic = readUint16(2);
  if (magic !== 42) {
    throw new Error('Archivo TIFF inválido');
  }

  const ifdOffset = readUint32(4);
  const numEntries = readUint16(ifdOffset);

  let width = 0;
  let height = 0;
  let dpiX = 72;
  let dpiY = 72;
  let resolutionUnit = 2;
  let colorSpace = 'unknown';
  let hasICCProfile = false;
  let iccProfile = undefined;
  let dpiDetected = false;

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + 2 + (i * 12);
    const tag = readUint16(entryOffset);
    const type = readUint16(entryOffset + 2);
    const count = readUint32(entryOffset + 4);

    // ImageWidth (256)
    if (tag === 256) {
      width = type === 3 ? readUint16(entryOffset + 8) : readUint32(entryOffset + 8);
    }

    // ImageLength (257)
    if (tag === 257) {
      height = type === 3 ? readUint16(entryOffset + 8) : readUint32(entryOffset + 8);
    }

    // XResolution (282)
    if (tag === 282) {
      const valueOffset = readUint32(entryOffset + 8);
      const numerator = readUint32(valueOffset);
      const denominator = readUint32(valueOffset + 4);
      dpiX = denominator > 0 ? Math.round(numerator / denominator) : 72;
      dpiDetected = true;
    }

    // YResolution (283)
    if (tag === 283) {
      const valueOffset = readUint32(entryOffset + 8);
      const numerator = readUint32(valueOffset);
      const denominator = readUint32(valueOffset + 4);
      dpiY = denominator > 0 ? Math.round(numerator / denominator) : 72;
      dpiDetected = true;
    }

    // ResolutionUnit (296)
    if (tag === 296) {
      resolutionUnit = readUint16(entryOffset + 8);
    }

    // PhotometricInterpretation (262)
    if (tag === 262) {
      const value = readUint16(entryOffset + 8);
      if (value === 0 || value === 1) colorSpace = 'Grayscale';
      else if (value === 2) colorSpace = 'RGB';
      else if (value === 5) colorSpace = 'CMYK';
    }

    // ICC Profile (34675)
    if (tag === 34675) {
      hasICCProfile = true;
      try {
        const profileOffset = readUint32(entryOffset + 8);
        const profileData = bytes.slice(profileOffset, profileOffset + Math.min(count, 500)).toString('latin1');
        if (profileData.includes('ISONewspaper') || profileData.includes('ISOnewspaper')) {
          iccProfile = 'ISONewspaper';
        } else if (profileData.includes('Eurostandard') || profileData.includes('EuroStandard')) {
          iccProfile = 'Euroestándar';
        } else if (profileData.includes('sRGB')) {
          iccProfile = 'sRGB';
        } else if (profileData.includes('AdobeRGB') || profileData.includes('Adobe RGB')) {
          iccProfile = 'Adobe RGB';
        }
      } catch (e) {
        // Profile parsing failed
      }
    }
  }

  // Convert cm to inch if needed
  if (resolutionUnit === 3) {
    dpiX = Math.round(dpiX * 2.54);
    dpiY = Math.round(dpiY * 2.54);
  }

  const dpi = Math.max(dpiX, dpiY);

  // Analyze text readability for raster images
  let textReadability = { isLegible: true, status: 'legible', details: [] };

  if (dpi < 150) {
    textReadability.isLegible = false;
    textReadability.status = 'no-legible';
    textReadability.details.push(`Resolución de ${dpi} dpi es insuficiente para texto legible`);
    textReadability.details.push('El texto en la imagen probablemente no se leerá correctamente');
  } else if (dpi < 200) {
    textReadability.status = 'warning';
    textReadability.details.push(`Resolución de ${dpi} dpi puede afectar la legibilidad del texto`);
  } else {
    textReadability.details.push(`Resolución de ${dpi} dpi es adecuada para texto legible`);
  }

  // Build printability analysis
  const issues = [];
  const recommendations = [];

  if (dpi < 200) {
    issues.push(`Resolución de ${dpi} dpi es inferior al mínimo de 200 dpi`);
    recommendations.push('Redimensionar imagen o usar una versión de mayor resolución');
  }

  if (colorSpace === 'RGB') {
    issues.push('El archivo está en RGB, se recomienda convertir a CMYK');
    recommendations.push('Convertir a CMYK con perfil ISONewspaper o Euroestándar');
  } else if (colorSpace === 'unknown') {
    issues.push('No se pudo detectar el espacio de color');
  }

  if (!hasICCProfile) {
    issues.push('No se detectó perfil ICC embebido');
    recommendations.push('Se recomienda embeber perfil ICC apropiado');
  }

  // Add text readability warning if needed
  if (!textReadability.isLegible) {
    issues.push('Resolución insuficiente para texto legible en impresión');
  }

  let status = 'ready';
  if (dpi < 200 || colorSpace === 'unknown') {
    status = 'error';
  } else if (colorSpace === 'RGB' || issues.length > 0) {
    status = 'warning';
  }

  if (recommendations.length === 0 && status === 'ready') {
    recommendations.push('Archivo listo para impresión en papel prensa');
  }

  return {
    fileName,
    fileType: 'TIFF',
    fileSize: formatFileSize(bytes.length),
    dimensions: {
      width,
      height,
      unit: 'px'
    },
    physicalDimensions: dpiDetected ? {
      width: pxToMm(width, dpi),
      height: pxToMm(height, dpi),
      unit: 'mm'
    } : undefined,
    resolution: {
      value: dpi,
      status: dpiDetected ? 'detected' : 'default',
      message: dpiDetected ? undefined : 'Resolución no detectada, usando 72 dpi por defecto'
    },
    colorSpace,
    hasICCProfile,
    iccProfile,
    textReadability,
    printability: { status, issues },
    recommendations
  };
}

// EPS Analyzer
function analyzeEPS(buffer, fileName) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const text = bytes.toString('latin1');

  // Extract BoundingBox
  let width = 0;
  let height = 0;
  const bbMatch = text.match(/%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
  if (bbMatch) {
    width = Math.abs(parseInt(bbMatch[3]) - parseInt(bbMatch[1]));
    height = Math.abs(parseInt(bbMatch[4]) - parseInt(bbMatch[2]));
  }

  // Try HiResBoundingBox for more precision
  const hrbbMatch = text.match(/%%HiResBoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
  if (hrbbMatch) {
    width = Math.abs(parseFloat(hrbbMatch[3]) - parseFloat(hrbbMatch[1]));
    height = Math.abs(parseFloat(hrbbMatch[4]) - parseFloat(hrbbMatch[2]));
  }

  // Convert points to mm
  const widthMm = Math.round(width * 0.352778 * 10) / 10;
  const heightMm = Math.round(height * 0.352778 * 10) / 10;

  // Detect color space from PostScript commands
  let colorSpace = 'unknown';
  if (text.includes('setcmykcolor') || text.includes('/DeviceCMYK')) {
    colorSpace = 'CMYK';
  } else if (text.includes('setrgbcolor') || text.includes('/DeviceRGB')) {
    colorSpace = 'RGB';
  } else if (text.includes('setgray') || text.includes('/DeviceGray')) {
    colorSpace = 'Grayscale';
  }

  // Text readability for vector files - always legible as vectors scale infinitely
  const textReadability = {
    isLegible: true,
    status: 'legible',
    details: ['Archivo vectorial - el texto es escalable y siempre legible']
  };

  // Build printability analysis
  const issues = [];
  const recommendations = [];

  if (colorSpace === 'RGB') {
    issues.push('El archivo utiliza colores RGB');
    recommendations.push('Convertir a CMYK para impresión');
  } else if (colorSpace === 'unknown') {
    issues.push('No se pudo determinar el espacio de color');
    recommendations.push('Verificar manualmente el espacio de color');
  }

  let status = 'ready';
  if (colorSpace === 'RGB' || colorSpace === 'unknown') {
    status = 'warning';
  }

  if (recommendations.length === 0 && status === 'ready') {
    recommendations.push('Archivo vectorial listo para impresión');
  }

  return {
    fileName,
    fileType: 'EPS',
    fileSize: formatFileSize(bytes.length),
    dimensions: {
      width: widthMm,
      height: heightMm,
      unit: 'mm'
    },
    resolution: {
      value: 'Vector',
      status: 'vector',
      message: 'Archivo vectorial - resolución no aplicable'
    },
    colorSpace,
    hasICCProfile: false,
    textReadability,
    printability: { status, issues },
    recommendations
  };
}

module.exports = {
  analyzePDF,
  analyzeJPG,
  analyzeTIFF,
  analyzeEPS
};
