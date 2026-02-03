# Análisis de Archivos de Preimpresión para Papel Prensa

## 📋 Descripción del Proyecto

Aplicación web profesional para análisis y validación de archivos destinados a impresión en papel prensa. Permite verificar archivos PDF, JPG, TIFF y EPS según los estándares de calidad requeridos para impresión en periódicos.

## 🎯 Funcionalidades Implementadas

### ✅ Análisis Completo de Archivos

- **Medidas**: Detección automática de dimensiones en mm/px

- **Resolución**: Validación contra mínimo de 200 dpi

- **Espacio de Color**: Identificación de RGB, CMYK o Grayscale

- **Perfil ICC**: Detección de perfiles embebidos (ISONewspaper/Euroestándar)

- **Validación de Imprimibilidad**: Análisis integral con reporte de problemas

### 📁 Formatos Soportados

- **PDF**: Análisis de documentos con detección de MediaBox y colorspace

- **JPG/JPEG**: Parser de headers EXIF con soporte para RGB/CMYK/Grayscale

- **TIFF/TIF**: Lectura de IFD tags para metadatos completos

- **EPS**: Análisis de archivos PostScript vectoriales

### 🎨 Interfaz de Usuario

- Drag & drop para subida de archivos

- Barra de progreso animada

- **Previsualización de archivos** a la izquierda del análisis técnico:

  - **JPG/JPEG**: Vista previa directa usando FileReader (procesamiento cliente)

  - **PDF**: Renderizado de primera página con PDF.js (procesamiento cliente)

  - **TIFF**: Información del archivo (navegadores no soportan preview directo)

  - **EPS**: Información del archivo vectorial

  - Sin transferencia de base64 desde servidor (evita problemas de memoria)

- Reportes detallados con código de colores (verde/amarillo/rojo)

- Diseño responsive con TailwindCSS

- Layout de dos columnas (preview + análisis)

- Logo DN integrado

- Copyright: ©A. Meléndez, 2026 rev.1

## 🔧 Especificaciones Técnicas

### Parámetros de Validación para Papel Prensa

- **Resolución mínima**: 200 dpi

- **Espacio de color recomendado**: CMYK (ISONewspaper/Euroestándar)

- **Cobertura máxima de tinta**: 240-250%

- **Perfil ICC recomendado**: ISONewspaper

- **Textos**: Negro 100% (K=100, C=M=Y=0)

### Capacidades de Análisis

#### PDF

- Dimensiones desde MediaBox

- Detección de DeviceCMYK/DeviceRGB/DeviceGray

- Identificación de perfiles ICC embebidos

- Resolución estimada (300 dpi default)

#### JPG/JPEG

- Dimensiones reales en píxeles

- Resolución DPI desde headers JFIF/EXIF

- Detección de componentes de color (RGB=3, CMYK=4, Gray=1)

- Soporte para archivos CMYK y Grayscale (manejo especial)

- Detección de perfiles ICC en segmentos APP2

#### TIFF

- Lectura de IFD tags (width, height, resolution)

- Soporte para byte order (little/big endian)

- PhotometricInterpretation para colorspace

- Detección de perfiles ICC (tag 34675)

#### EPS

- Extracción de BoundingBox

- Detección de comandos PostScript (setcmykcolor/setrgbcolor)

- Identificación de archivos vectoriales

## 🚀 URLs del Proyecto

### Sandbox (Desarrollo)

- **URL**: <https://3000-ioe7aliv5hd9az963fc3w-de59bda9.sandbox.novita.ai>

- **Estado**: ✅ Activo

### Producción (Cloudflare Pages)

- Pendiente de despliegue

## 📊 Arquitectura de Datos

### Estructura de Análisis

```typescript

{

  fileName: string

  fileType: string

  fileSize: string

  dimensions: {

    width: number

    height: number

    unit: 'mm' | 'px'

  }

  physicalDimensions?: {

    width: number

    height: number

    unit: 'mm'

  }

  resolution: {

    value: number | 'Vector'

    status: 'detected' | 'estimated' | 'vector' | 'default'

    message?: string

  }

  colorSpace: 'RGB' | 'CMYK' | 'Grayscale' | 'unknown'

  hasICCProfile: boolean

  iccProfile?: string

  printability: {

    status: 'ready' | 'warning' | 'error'

    issues: string[]

  }

  recommendations: string[]

}

```

### Sistema de Validación

- **Verde (ready)**: Archivo listo para impresión sin problemas

- **Amarillo (warning)**: Archivo usable con advertencias menores

- **Rojo (error)**: Archivo no apto, requiere corrección

## 📖 Guía de Uso

1. **Acceder a la aplicación** mediante la URL del sandbox

2. **Arrastrar archivo** a la zona de drop o hacer clic para seleccionar

3. **Esperar análisis** (barra de progreso indica estado)

4. **Revisar reporte** con todos los parámetros técnicos

5. **Verificar estado** de imprimibilidad (verde/amarillo/rojo)

6. **Seguir recomendaciones** para corregir problemas detectados

### Ejemplo de Uso

- Subir PDF de 210x297mm (A4)

- Sistema detecta CMYK, 300 dpi, sin perfil ICC

- Reporte muestra: "Requiere atención - No se detectó perfil ICC"

- Recomendación: "Se recomienda usar ISONewspaper"

## ⚠️ Limitaciones Actuales

### Análisis Parcial (requiere APIs externas)

- **Cobertura de tinta**: Cálculo preciso requiere análisis pixel-por-pixel

- **Textos en negro 100%**: Requiere parsing profundo de PDFs

- **Conversión PDF→JPG/WebP**: Preview no implementado (requiere API externa)

- **Análisis de gamut CMYK**: Validación precisa contra perfil ISONewspaper

### Limitaciones Técnicas (Cloudflare Workers)

- Sin acceso a binarios (ImageMagick, Ghostscript)

- Sin procesamiento intensivo de píxeles

- Análisis basado en metadatos y headers

### Casos Especiales

- **JPG en escala de grises**: Detección correcta, advertencia informativa

- **JPG CMYK**: Soporte completo con parsing de 4 componentes

- **EPS**: Resolución no aplicable (vectorial)

- **PDF con múltiples páginas**: Solo analiza primera página

## 🔮 Funcionalidades Pendientes

### Alta Prioridad

1. ✅ ~~Análisis básico de medidas~~ (Completado)

2. ✅ ~~Detección de resolución~~ (Completado)

3. ✅ ~~Identificación de espacio de color~~ (Completado)

4. ✅ ~~Detección de perfiles ICC~~ (Completado)

5. ✅ ~~Preview de archivos PDF~~ (Completado - usando PDF.js)

6. ✅ ~~Preview de archivos JPG~~ (Completado)

7. ⏳ **Análisis de cobertura de tinta** (requiere API externa)

8. ⏳ **Validación de textos en negro 100%** (requiere API externa)

### Mejoras Futuras

- Integración con APIs de análisis de PDF (PDF.co, CloudConvert)

- Análisis de gamut CMYK con perfiles ICC

- Generación de reportes PDF descargables

- Comparación con perfiles de impresión múltiples

- Soporte para archivos AI (Adobe Illustrator)

- Validación de sobreimpresión (overprint)

- Detección de fuentes no embebidas

## 🛠️ Stack Tecnológico

- **Framework**: Hono (lightweight web framework)

- **Runtime**: Cloudflare Workers/Pages

- **Frontend**: HTML5 + TailwindCSS + FontAwesome

- **Preview**: PDF.js para renderizado de PDFs

- **Análisis**: Parsers nativos JavaScript (sin dependencias binarias)

- **Deployment**: Wrangler CLI

## 📦 Instalación y Desarrollo

```bash

# Instalar dependencias

npm install

 

# Desarrollo local

npm run dev

 

# Build para producción

npm run build

 

# Preview del build

npm run preview

 

# Desarrollo en sandbox

npm run dev:sandbox

 

# Limpiar puerto 3000

npm run clean-port

 

# Desplegar a Cloudflare Pages

npm run deploy:prod

```

## 🚀 Próximos Pasos Recomendados

1. **Integrar API de análisis avanzado**

   - PDF.co para análisis de cobertura de tinta

   - CloudConvert para conversión PDF→imagen

   - API de validación de gamut CMYK

2. **Mejorar análisis de textos**

   - Parser de contenido de PDF con PDF.js completo

   - Detección de textos en colores compuestos

   - Validación K=100, C=M=Y=0

3. **Preview de archivos**

   - Conversión PDF→JPG/WebP

   - Thumbnail automático

   - Zoom y navegación de páginas

4. **Reportes descargables**

   - Generación de PDF con análisis completo

   - Exportación JSON con metadatos

   - Historial de análisis

5. **Desplegar a producción**

   - Configurar dominio personalizado

   - Variables de entorno para APIs

   - Monitoreo y analytics

## 📄 Licencia y Copyright

©A. Meléndez, 2026 rev.1

---

**Última actualización**: 2026-01-15

**Estado del proyecto**: ✅ En desarrollo activo

**Versión**: 1.1.0 (con preview de archivos)
