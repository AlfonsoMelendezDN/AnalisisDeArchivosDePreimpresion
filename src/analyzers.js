// Helper functions
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function pxToMm(px, dpi) {
  return Math.round((px / dpi) * 25.4 * 10) / 10;
}

// Convert any buffer type to Uint8Array (browser compatible)
function toUint8Array(buffer) {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    return new Uint8Array(buffer);
  }
  return new Uint8Array(buffer);
}

// Convert Uint8Array to string (browser compatible replacement for Buffer.toString)
function bytesToString(bytes, start, end) {
  const slice = bytes.slice(start, end);
  let str = '';
  for (let i = 0; i < slice.length; i++) {
    str += String.fromCharCode(slice[i]);
  }
  return str;
}

// Minimum font size for newspaper print legibility (in points)
const MIN_FONT_SIZE_NEWSPAPER = 6;

// PDF Analyzer
function analyzePDF(buffer, fileName) {
  const bytes = toUint8Array(buffer);
  const text = bytesToString(bytes, 0, bytes.length);

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
      if (size > 0 && size < 200) {
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
  const bytes = toUint8Array(buffer);
  let width = 0;
  let height = 0;
  let dpiX = 72;
  let dpiY = 72;
  let colorSpace = 'RGB';
  let hasICCProfile = false;
  let iccProfile = undefined;
  let dpiDetected = false;
  let dpiSource = '';

  let offset = 0;

  // Check JPEG signature
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    throw new Error('Archivo JPG inválido');
  }

  offset = 2;

  // Helper to read big-endian uint16
  const readBE16 = (pos) => (bytes[pos] << 8) | bytes[pos + 1];

  while (offset < bytes.length - 1) {
    // Find next marker
    if (bytes[offset] !== 0xFF) {
      offset++;
      continue;
    }

    // Skip padding FF bytes
    while (offset < bytes.length - 1 && bytes[offset + 1] === 0xFF) {
      offset++;
    }

    if (offset >= bytes.length - 1) break;

    const marker = bytes[offset + 1];

    // End of image
    if (marker === 0xD9) break;

    // Standalone markers (no length)
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      offset += 2;
      continue;
    }

    // Read segment length
    if (offset + 3 >= bytes.length) break;
    const segmentLength = readBE16(offset + 2);
    if (segmentLength < 2) {
      offset += 2;
      continue;
    }

    const segmentStart = offset + 4; // After marker and length
    const segmentEnd = Math.min(offset + 2 + segmentLength, bytes.length);

    // APP0 - JFIF
    if (marker === 0xE0 && segmentEnd >= segmentStart + 12) {
      const sig = String.fromCharCode(bytes[segmentStart], bytes[segmentStart + 1],
                                       bytes[segmentStart + 2], bytes[segmentStart + 3],
                                       bytes[segmentStart + 4]);
      if (sig === 'JFIF\0') {
        const units = bytes[segmentStart + 7];
        const densityX = readBE16(segmentStart + 8);
        const densityY = readBE16(segmentStart + 10);

        // units: 0 = aspect ratio only, 1 = dots per inch, 2 = dots per cm
        if (units === 1 && densityX > 0 && densityX <= 10000) {
          dpiX = densityX;
          dpiY = densityY > 0 ? densityY : densityX;
          dpiDetected = true;
          dpiSource = 'JFIF';
        } else if (units === 2 && densityX > 0 && densityX <= 10000) {
          dpiX = Math.round(densityX * 2.54);
          dpiY = Math.round((densityY > 0 ? densityY : densityX) * 2.54);
          dpiDetected = true;
          dpiSource = 'JFIF';
        }
        // units === 0 means aspect ratio only, not real DPI - continue looking
      }
    }

    // APP1 - EXIF (only parse if we haven't found DPI yet or to potentially override JFIF)
    if (marker === 0xE1 && segmentEnd >= segmentStart + 8) {
      const sig = String.fromCharCode(bytes[segmentStart], bytes[segmentStart + 1],
                                       bytes[segmentStart + 2], bytes[segmentStart + 3],
                                       bytes[segmentStart + 4], bytes[segmentStart + 5]);
      if (sig === 'Exif\0\0') {
        const tiffStart = segmentStart + 6;

        if (tiffStart + 8 < segmentEnd) {
          // Check byte order
          const byteOrderMark = readBE16(tiffStart);
          const littleEndian = byteOrderMark === 0x4949; // 'II'
          const bigEndian = byteOrderMark === 0x4D4D; // 'MM'

          if (littleEndian || bigEndian) {
            const readU16 = (pos) => {
              if (pos + 1 >= bytes.length) return 0;
              return littleEndian
                ? (bytes[pos] | (bytes[pos + 1] << 8))
                : ((bytes[pos] << 8) | bytes[pos + 1]);
            };

            const readU32 = (pos) => {
              if (pos + 3 >= bytes.length) return 0;
              return littleEndian
                ? (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
                : (((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3])) >>> 0;
            };

            try {
              // Check TIFF magic number (42)
              const magic = readU16(tiffStart + 2);
              if (magic === 42) {
                const ifdOffsetRel = readU32(tiffStart + 4);
                const ifdOffset = tiffStart + ifdOffsetRel;

                if (ifdOffset + 2 < segmentEnd && ifdOffsetRel < 65536) {
                  const numEntries = readU16(ifdOffset);

                  if (numEntries > 0 && numEntries < 200) {
                    let exifDpiX = null;
                    let exifDpiY = null;
                    let exifResUnit = 2; // Default: inches

                    for (let i = 0; i < numEntries; i++) {
                      const entryPos = ifdOffset + 2 + (i * 12);
                      if (entryPos + 12 > segmentEnd) break;

                      const tag = readU16(entryPos);
                      const type = readU16(entryPos + 2);
                      const count = readU32(entryPos + 4);

                      // ResolutionUnit (tag 296, type SHORT)
                      if (tag === 296 && type === 3) {
                        exifResUnit = readU16(entryPos + 8);
                      }

                      // XResolution (tag 282) or YResolution (tag 283), type RATIONAL (5)
                      if ((tag === 282 || tag === 283) && type === 5 && count === 1) {
                        const valueOffsetRel = readU32(entryPos + 8);
                        const valuePos = tiffStart + valueOffsetRel;

                        if (valuePos + 8 <= segmentEnd && valueOffsetRel < 65536) {
                          const numerator = readU32(valuePos);
                          const denominator = readU32(valuePos + 4);

                          if (denominator > 0 && numerator > 0) {
                            const res = numerator / denominator;
                            if (res >= 1 && res <= 10000) {
                              if (tag === 282) exifDpiX = res;
                              else exifDpiY = res;
                            }
                          }
                        }
                      }
                    }

                    // Apply unit conversion and use values
                    if (exifDpiX !== null || exifDpiY !== null) {
                      // ResolutionUnit: 1 = no unit, 2 = inches, 3 = centimeters
                      if (exifResUnit === 3) {
                        if (exifDpiX !== null) exifDpiX *= 2.54;
                        if (exifDpiY !== null) exifDpiY *= 2.54;
                      }

                      // EXIF resolution overrides JFIF if valid
                      if (exifDpiX !== null && exifDpiX >= 1 && exifDpiX <= 10000) {
                        dpiX = Math.round(exifDpiX);
                        dpiDetected = true;
                        dpiSource = 'EXIF';
                      }
                      if (exifDpiY !== null && exifDpiY >= 1 && exifDpiY <= 10000) {
                        dpiY = Math.round(exifDpiY);
                        dpiDetected = true;
                        dpiSource = 'EXIF';
                      }
                    }
                  }
                }
              }
            } catch (e) {
              // EXIF parsing error, continue
            }
          }
        }
      }
    }

    // APP2 - ICC Profile
    if (marker === 0xE2 && segmentEnd >= segmentStart + 14) {
      const sig = String.fromCharCode(
        bytes[segmentStart], bytes[segmentStart + 1], bytes[segmentStart + 2],
        bytes[segmentStart + 3], bytes[segmentStart + 4], bytes[segmentStart + 5],
        bytes[segmentStart + 6], bytes[segmentStart + 7], bytes[segmentStart + 8],
        bytes[segmentStart + 9], bytes[segmentStart + 10], bytes[segmentStart + 11]
      );
      if (sig.startsWith('ICC_PROFILE\0')) {
        hasICCProfile = true;
        // Try to identify profile name
        const profileData = bytesToString(bytes, segmentStart + 14, segmentEnd);
        if (profileData.includes('ISONewspaper') || profileData.includes('ISOnewspaper')) {
          iccProfile = 'ISONewspaper';
        } else if (profileData.includes('Eurostandard') || profileData.includes('EuroStandard')) {
          iccProfile = 'Euroestándar';
        } else if (profileData.includes('sRGB')) {
          iccProfile = 'sRGB';
        } else if (profileData.includes('AdobeRGB') || profileData.includes('Adobe RGB')) {
          iccProfile = 'Adobe RGB';
        } else if (profileData.includes('Display P3')) {
          iccProfile = 'Display P3';
        } else if (profileData.includes('CMYK')) {
          iccProfile = 'CMYK Profile';
        }
      }
    }

    // APP13 - Photoshop IRB (Image Resource Blocks)
    if (marker === 0xED && !dpiDetected && segmentEnd >= segmentStart + 14) {
      const sig = String.fromCharCode(
        bytes[segmentStart], bytes[segmentStart + 1], bytes[segmentStart + 2],
        bytes[segmentStart + 3], bytes[segmentStart + 4], bytes[segmentStart + 5],
        bytes[segmentStart + 6], bytes[segmentStart + 7], bytes[segmentStart + 8],
        bytes[segmentStart + 9], bytes[segmentStart + 10], bytes[segmentStart + 11],
        bytes[segmentStart + 12], bytes[segmentStart + 13]
      );

      if (sig.startsWith('Photoshop 3.0\0')) {
        let pos = segmentStart + 14;

        // Parse 8BIM resources
        while (pos + 12 < segmentEnd) {
          // Look for 8BIM signature
          if (bytes[pos] !== 0x38 || bytes[pos + 1] !== 0x42 ||
              bytes[pos + 2] !== 0x49 || bytes[pos + 3] !== 0x4D) {
            pos++;
            continue;
          }

          const resourceId = readBE16(pos + 4);

          // Pascal string (name) - first byte is length
          const nameLen = bytes[pos + 6];
          // Padded to even length (including length byte)
          const paddedNameLen = (nameLen + 1 + 1) & ~1;

          const dataSizePos = pos + 6 + paddedNameLen;
          if (dataSizePos + 4 > segmentEnd) break;

          const dataSize = (bytes[dataSizePos] << 24) | (bytes[dataSizePos + 1] << 16) |
                           (bytes[dataSizePos + 2] << 8) | bytes[dataSizePos + 3];
          const dataPos = dataSizePos + 4;

          // Resource 0x03ED = Resolution Info
          if (resourceId === 0x03ED && dataPos + 16 <= segmentEnd) {
            // Resolution info structure:
            // 4 bytes: hRes (Fixed 16.16)
            // 2 bytes: hResUnit (1=pixels/inch, 2=pixels/cm)
            // 2 bytes: widthUnit
            // 4 bytes: vRes (Fixed 16.16)
            // 2 bytes: vResUnit
            // 2 bytes: heightUnit

            const hResFixed = (bytes[dataPos] << 24) | (bytes[dataPos + 1] << 16) |
                              (bytes[dataPos + 2] << 8) | bytes[dataPos + 3];
            const hRes = hResFixed / 65536;
            const hResUnit = readBE16(dataPos + 4);

            const vResFixed = (bytes[dataPos + 8] << 24) | (bytes[dataPos + 9] << 16) |
                              (bytes[dataPos + 10] << 8) | bytes[dataPos + 11];
            const vRes = vResFixed / 65536;

            if (hRes >= 1 && hRes <= 10000) {
              // hResUnit: 1 = pixels/inch, 2 = pixels/cm
              dpiX = hResUnit === 2 ? Math.round(hRes * 2.54) : Math.round(hRes);
              dpiDetected = true;
              dpiSource = 'Photoshop';
            }
            if (vRes >= 1 && vRes <= 10000) {
              dpiY = hResUnit === 2 ? Math.round(vRes * 2.54) : Math.round(vRes);
              dpiDetected = true;
              dpiSource = 'Photoshop';
            }
            break;
          }

          // Move to next resource (data is padded to even length)
          const paddedDataSize = (dataSize + 1) & ~1;
          pos = dataPos + paddedDataSize;
        }
      }
    }

    // SOF markers (Start of Frame) - Get dimensions and color info
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
        (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      if (segmentEnd >= segmentStart + 6) {
        height = readBE16(segmentStart + 1);
        width = readBE16(segmentStart + 3);
        const components = bytes[segmentStart + 5];

        if (components === 1) {
          colorSpace = 'Grayscale';
        } else if (components === 3) {
          colorSpace = 'RGB';
        } else if (components === 4) {
          colorSpace = 'CMYK';
        }
      }
    }

    // Move to next segment
    offset += 2 + segmentLength;
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
  }

  if (!hasICCProfile) {
    issues.push('No se detectó perfil ICC embebido');
    recommendations.push('Se recomienda embeber perfil ICC apropiado');
  } else if (iccProfile && !['ISONewspaper', 'Euroestándar', 'CMYK Profile'].includes(iccProfile)) {
    issues.push(`Perfil ICC "${iccProfile}" no es óptimo para papel prensa`);
    recommendations.push('Convertir a perfil ISONewspaper o Euroestándar');
  }

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
  const bytes = toUint8Array(buffer);

  // Check byte order
  const byteOrder = (bytes[0] << 8) | bytes[1];
  const littleEndian = byteOrder === 0x4949;

  const readUint16 = (pos) => {
    if (pos + 1 >= bytes.length) return 0;
    return littleEndian
      ? bytes[pos] | (bytes[pos + 1] << 8)
      : (bytes[pos] << 8) | bytes[pos + 1];
  };

  const readUint32 = (pos) => {
    if (pos + 3 >= bytes.length) return 0;
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

  for (let i = 0; i < numEntries && i < 100; i++) {
    const entryOffset = ifdOffset + 2 + (i * 12);
    if (entryOffset + 12 > bytes.length) break;

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
      if (valueOffset + 8 <= bytes.length) {
        const numerator = readUint32(valueOffset);
        const denominator = readUint32(valueOffset + 4);
        dpiX = denominator > 0 ? Math.round(numerator / denominator) : 72;
        dpiDetected = true;
      }
    }

    // YResolution (283)
    if (tag === 283) {
      const valueOffset = readUint32(entryOffset + 8);
      if (valueOffset + 8 <= bytes.length) {
        const numerator = readUint32(valueOffset);
        const denominator = readUint32(valueOffset + 4);
        dpiY = denominator > 0 ? Math.round(numerator / denominator) : 72;
        dpiDetected = true;
      }
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
        const profileEnd = Math.min(profileOffset + count, profileOffset + 500, bytes.length);
        const profileData = bytesToString(bytes, profileOffset, profileEnd);
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
  const bytes = toUint8Array(buffer);
  const text = bytesToString(bytes, 0, bytes.length);

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

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    analyzePDF,
    analyzeJPG,
    analyzeTIFF,
    analyzeEPS
  };
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.Analyzers = {
    analyzePDF,
    analyzeJPG,
    analyzeTIFF,
    analyzeEPS
  };
}
