import React from 'react';
import type { SectionShapeType, SectionDimensions, SectionProperties } from '../../types';

interface SectionDiagramProps {
  shapeType: SectionShapeType;
  dimensions: SectionDimensions;
  properties?: SectionProperties | null;
}

const SectionDiagram: React.FC<SectionDiagramProps> = ({ shapeType, dimensions, properties }) => {
  const svgSize = 200;
  const padding = 20;
  const viewBox = `0 0 ${svgSize} ${svgSize}`;

  const renderShape = () => {
    switch (shapeType) {
      case 'circle':
        return renderCircle();
      case 'pipe':
        return renderPipe();
      case 'rectangle':
        return renderRectangle();
      case 'box':
        return renderBox();
      case 'h-beam':
        return renderHBeam();
      case 'l-angle':
        return renderLAngle();
      case 'channel':
        return renderChannel();
      default:
        return null;
    }
  };

  const renderCircle = () => {
    const D = dimensions.diameter || 100;
    const r = (svgSize - padding * 2) / 2;
    const cx = svgSize / 2;
    const cy = svgSize / 2;

    return (
      <g>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400"
          strokeWidth="2"
        />
        {/* 直径寸法線 */}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy}
          className="stroke-gray-600 dark:stroke-gray-400" strokeWidth="1" strokeDasharray="4" />
        <text x={cx} y={cy - 10} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">D={D}</text>
      </g>
    );
  };

  const renderPipe = () => {
    const D = dimensions.outerDiameter || 100;
    const d = dimensions.innerDiameter || 80;
    const scale = (svgSize - padding * 2) / D;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const rOuter = (D * scale) / 2;
    const rInner = (d * scale) / 2;

    return (
      <g>
        <circle cx={cx} cy={cy} r={rOuter}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={rInner}
          className="fill-white dark:fill-gray-800 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        <line x1={cx - rOuter} y1={cy} x2={cx + rOuter} y2={cy}
          className="stroke-gray-600 dark:stroke-gray-400" strokeWidth="1" strokeDasharray="4" />
        <text x={cx} y={cy - rOuter - 5} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">D={D}</text>
        <text x={cx} y={cy + 15} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">d={d}</text>
      </g>
    );
  };

  const renderRectangle = () => {
    const B = dimensions.width || 100;
    const H = dimensions.height || 200;
    const maxDim = Math.max(B, H);
    const scale = (svgSize - padding * 2) / maxDim;
    const w = B * scale;
    const h = H * scale;
    const x = (svgSize - w) / 2;
    const y = (svgSize - h) / 2;

    return (
      <g>
        <rect x={x} y={y} width={w} height={h}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        {/* 寸法表示 */}
        <text x={x + w / 2} y={y - 5} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">B={B}</text>
        <text x={x + w + 10} y={y + h / 2} textAnchor="start"
          className="fill-gray-700 dark:fill-gray-300 text-xs">H={H}</text>
      </g>
    );
  };

  const renderBox = () => {
    const B = dimensions.outerWidth || 100;
    const H = dimensions.outerHeight || 200;
    const t = dimensions.thickness || 10;
    const maxDim = Math.max(B, H);
    const scale = (svgSize - padding * 2) / maxDim;
    const wOuter = B * scale;
    const hOuter = H * scale;
    const wInner = (B - 2 * t) * scale;
    const hInner = (H - 2 * t) * scale;
    const x = (svgSize - wOuter) / 2;
    const y = (svgSize - hOuter) / 2;
    const xi = (svgSize - wInner) / 2;
    const yi = (svgSize - hInner) / 2;

    return (
      <g>
        <rect x={x} y={y} width={wOuter} height={hOuter}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        <rect x={xi} y={yi} width={wInner} height={hInner}
          className="fill-white dark:fill-gray-800 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        <text x={x + wOuter / 2} y={y - 5} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">B={B}</text>
        <text x={x + wOuter + 5} y={y + hOuter / 2} textAnchor="start"
          className="fill-gray-700 dark:fill-gray-300 text-xs">H={H}</text>
        <text x={x + wOuter / 2} y={y + hOuter + 15} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">t={t}</text>
      </g>
    );
  };

  const renderHBeam = () => {
    const B = dimensions.flangeWidth || 200;
    const H = dimensions.webHeight || 400;
    const tf = dimensions.flangeThickness || 16;
    const tw = dimensions.webThickness || 10;
    const maxDim = Math.max(B, H);
    const scale = (svgSize - padding * 2) / maxDim;

    const width = B * scale;
    const height = H * scale;
    const flangeH = tf * scale;
    const webW = tw * scale;
    const cx = svgSize / 2;
    const cy = svgSize / 2;

    return (
      <g>
        {/* 上フランジ */}
        <rect x={cx - width / 2} y={cy - height / 2} width={width} height={flangeH}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        {/* 下フランジ */}
        <rect x={cx - width / 2} y={cy + height / 2 - flangeH} width={width} height={flangeH}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        {/* ウェブ */}
        <rect x={cx - webW / 2} y={cy - height / 2 + flangeH} width={webW} height={height - 2 * flangeH}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400" strokeWidth="2" />
        {/* 寸法 */}
        <text x={cx} y={cy - height / 2 - 5} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">B={B}</text>
        <text x={cx + width / 2 + 5} y={cy} textAnchor="start"
          className="fill-gray-700 dark:fill-gray-300 text-xs">H={H}</text>
      </g>
    );
  };

  const renderLAngle = () => {
    const A = dimensions.legA || 100;
    const B = dimensions.legB || 100;
    const t = dimensions.legThickness || 10;
    const maxDim = Math.max(A, B);
    const scale = (svgSize - padding * 2) / maxDim;

    const legALen = A * scale;
    const legBLen = B * scale;
    const thickness = t * scale;
    const baseX = padding + 10;
    const baseY = svgSize - padding - 10;

    // 図心表示
    const Cx = properties?.centroidX;
    const Cy = properties?.centroidY;

    return (
      <g>
        {/* L型断面 */}
        <polygon
          points={`
            ${baseX},${baseY}
            ${baseX + legALen},${baseY}
            ${baseX + legALen},${baseY - thickness}
            ${baseX + thickness},${baseY - thickness}
            ${baseX + thickness},${baseY - legBLen}
            ${baseX},${baseY - legBLen}
          `}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400"
          strokeWidth="2"
        />
        {/* 寸法 */}
        <text x={baseX + legALen / 2} y={baseY + 15} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">A={A}</text>
        <text x={baseX - 10} y={baseY - legBLen / 2} textAnchor="end"
          className="fill-gray-700 dark:fill-gray-300 text-xs">B={B}</text>
        {/* 図心マーク */}
        {Cx !== undefined && Cy !== undefined && (
          <g>
            <circle cx={baseX + Cx * scale} cy={baseY - Cy * scale} r="3"
              className="fill-red-500" />
            <text x={baseX + Cx * scale + 8} y={baseY - Cy * scale + 4}
              className="fill-red-600 dark:fill-red-400 text-xs">G</text>
          </g>
        )}
      </g>
    );
  };

  const renderChannel = () => {
    const B = dimensions.channelWidth || 75;
    const H = dimensions.channelHeight || 150;
    const tf = dimensions.channelFlangeThickness || 10;
    const tw = dimensions.channelWebThickness || 6;
    const maxDim = Math.max(B * 1.5, H);
    const scale = (svgSize - padding * 2) / maxDim;

    const width = B * scale;
    const height = H * scale;
    const flangeH = tf * scale;
    const webW = tw * scale;
    const cx = svgSize / 2;
    const cy = svgSize / 2;

    // 図心表示
    const Cx = properties?.centroidX;

    return (
      <g>
        {/* 溝型断面 */}
        <polygon
          points={`
            ${cx - width / 2},${cy - height / 2}
            ${cx + width / 2},${cy - height / 2}
            ${cx + width / 2},${cy - height / 2 + flangeH}
            ${cx - width / 2 + webW},${cy - height / 2 + flangeH}
            ${cx - width / 2 + webW},${cy + height / 2 - flangeH}
            ${cx + width / 2},${cy + height / 2 - flangeH}
            ${cx + width / 2},${cy + height / 2}
            ${cx - width / 2},${cy + height / 2}
          `}
          className="fill-blue-100 dark:fill-blue-900 stroke-blue-600 dark:stroke-blue-400"
          strokeWidth="2"
        />
        {/* 寸法 */}
        <text x={cx} y={cy - height / 2 - 5} textAnchor="middle"
          className="fill-gray-700 dark:fill-gray-300 text-xs">B={B}</text>
        <text x={cx + width / 2 + 5} y={cy} textAnchor="start"
          className="fill-gray-700 dark:fill-gray-300 text-xs">H={H}</text>
        {/* 図心マーク */}
        {Cx !== undefined && (
          <g>
            <circle cx={cx - width / 2 + Cx * scale} cy={cy} r="3"
              className="fill-red-500" />
            <text x={cx - width / 2 + Cx * scale + 8} y={cy + 4}
              className="fill-red-600 dark:fill-red-400 text-xs">G</text>
          </g>
        )}
      </g>
    );
  };

  return (
    <svg viewBox={viewBox} className="w-full h-full max-w-[200px] max-h-[200px]">
      {renderShape()}
    </svg>
  );
};

export default SectionDiagram;
