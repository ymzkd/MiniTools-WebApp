# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Math Tools Suite**, an integrated web application that combines two powerful mathematical tools:

1. **LaTeX Matrix Editor** - Visual editing of mathematical matrices with real-time LaTeX preview and generation
2. **Figure Layout Tool** - Academic figure arrangement tool with drag-and-drop functionality and mathematical caption support

The applications are unified under a single interface with tab-based navigation, providing a comprehensive toolkit for mathematical document preparation.

## Architecture

### Core Components
- **Unified App Layout**: Tab-based navigation between tools (`src/components/common/AppLayout.tsx`)
- **LaTeX Matrix Editor**: Mathematical matrix editing (`src/components/matrix/LaTeXMatrixEditor.tsx`)
- **Figure Layout Tool**: Image arrangement system (`src/components/figure/FigureLayoutApp.tsx`)
- **KaTeX Integration**: Mathematical rendering using KaTeX v0.16.22 with MathML output
- **Shared Components**: Common UI elements, navigation, toast notifications, and theme management

### Key Features

#### Matrix Editor Features
- Visual matrix editing with cell-by-cell input and real-time KaTeX rendering
- Multiple matrix types (pmatrix, bmatrix, vmatrix, Vmatrix, smallmatrix)
- Advanced table UI with hover-based row/column insertion/deletion controls
- Multi-cell selection and copy/paste functionality (drag, Ctrl+click, Shift+click)
- Symmetric matrix mode with auto-synchronization
- LaTeX code import/export with parsing validation
- Comprehensive keyboard navigation (Tab, arrows, Ctrl+C/V/A)
- Context menus for row/column operations
- Real-time KaTeX preview with selected cell highlighting

#### Figure Layout Features
- Drag-and-drop image upload and arrangement
- Flexible grid system with automatic row organization
- Mathematical caption support with KaTeX rendering ($...$ and $$...$$ syntax)
- Multiple export formats (PNG, PDF) with resolution control
- Image reordering via drag-and-drop
- Clipboard copy functionality
- Customizable layout spacing and caption styling

#### Theme and UI Features
- **Dark/Light Mode Toggle**: System preference detection with manual override
- **Theme Persistence**: User preference saved in localStorage
- **Smooth Transitions**: Animated theme switching with consistent styling
- **Responsive Design**: Optimized for desktop and mobile devices

### Data Flow
1. User interacts with matrix cells through clicking, typing, or keyboard navigation
2. Cell selection state and content updates trigger real-time rendering
3. KaTeX renders individual cells (with auto-scaling) and full matrix preview
4. LaTeX code generation happens automatically with syntax validation
5. Multi-cell operations (copy/paste) update matrix dimensions as needed
6. Selected cells and ranges are highlighted in both table and preview

## Technical Stack

- **Frontend**: React 19 with Hooks and TypeScript
- **Build Tool**: Vite with hot reload and development server
- **Math Rendering**: KaTeX v0.16.22 (CDN + npm package) with MathML output
- **Icons**: Lucide React for consistent iconography
- **Image Processing**: html2canvas for image export, jsPDF for PDF generation
- **Styling**: Tailwind CSS with unified design system
- **State Management**: React hooks (useState, custom hooks)
- **Code Quality**: ESLint 9 with TypeScript support
- **Navigation**: Tab-based routing with shared layout components

## Development Commands

- **Start development server**: `npm run dev` (runs on http://localhost:3000)
- **Build for production**: `npm run build`
- **Lint code**: `npm run lint`
- **Preview production build**: `npm run preview`

## Development Context

The project is now set up as a modern Node.js application with Vite + React 19 + TypeScript. The application features a modular architecture with separate tool implementations:

```
src/
├── components/
│   ├── common/           # Shared components (Navigation, Layout, Toast)
│   ├── matrix/           # LaTeX Matrix Editor components
│   └── figure/           # Figure Layout Tool components
├── hooks/                # Custom React hooks
├── types/                # TypeScript type definitions
└── App.tsx              # Main application with tab routing
```

### Advanced UI Features
- **Table Controls**: Hover-based insertion/deletion buttons positioned outside table boundaries
- **Smart Selection**: Single cell, range selection (drag/Shift+click), multi-selection (Ctrl+click)
- **Copy/Paste**: Internal clipboard with TSV compatibility, auto-expands matrix dimensions
- **Context Menus**: Right-click operations for row/column management
- **Keyboard Navigation**: Full Tab/arrow key support with Shift for range selection
- **Visual Feedback**: Color-coded selection states, symmetric cell indicators
- **Responsive Scaling**: Auto-scaling cell content to fit within cell boundaries

### Matrix Features
- **Symmetric Mode**: Auto-synchronizes opposite cells in square matrices
- **Presets**: Identity, zero, clear, and symmetric matrix templates
- **LaTeX Import**: Real-time parsing with error handling and validation
- **Multiple Types**: Support for all standard LaTeX matrix environments
- **Real-time Preview**: Live KaTeX rendering with selection highlighting

### Current Status
- ✅ **Fully Integrated Math Tools Suite** - Both Matrix Editor and Figure Layout Tool unified
- ✅ **Modern React 19 + TypeScript** implementation with strict type checking
- ✅ **Tab-based Navigation** - Seamless switching between tools
- ✅ **Unified Design System** - Consistent Tailwind CSS styling across all components
- ✅ **Advanced KaTeX Integration** - v0.16.22 with MathML output support
- ✅ **Complete Feature Set** - All original functionality preserved and enhanced
- ✅ **Production-ready Build** - ESLint 9, optimized bundling, comprehensive testing