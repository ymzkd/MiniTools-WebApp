# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a LaTeX Matrix Editor web application that allows visual editing of mathematical matrices with real-time LaTeX preview and generation. The goal is to replace tedious text-based LaTeX matrix editing with an intuitive, spreadsheet-like interface.

## Architecture

### Core Components
- **LaTeX Matrix Editor**: Main React component (`src/components/LaTeXMatrixEditor.tsx`)
- **KaTeX Integration**: Mathematical rendering using KaTeX v0.16.8 with MathML output
- **Matrix Data Structure**: 2D array with metadata (type, dimensions)
- **Real-time Rendering**: Bidirectional LaTeX ↔ Visual editing

### Key Features
- Visual matrix editing with cell-by-cell input and real-time KaTeX rendering
- Multiple matrix types (pmatrix, bmatrix, vmatrix, Vmatrix, smallmatrix)
- Advanced table UI with hover-based row/column insertion/deletion controls
- Multi-cell selection and copy/paste functionality (drag, Ctrl+click, Shift+click)
- Symmetric matrix mode with auto-synchronization
- LaTeX code import/export with parsing validation
- Comprehensive keyboard navigation (Tab, arrows, Ctrl+C/V/A)
- Context menus for row/column operations
- Real-time KaTeX preview with selected cell highlighting

### Data Flow
1. User interacts with matrix cells through clicking, typing, or keyboard navigation
2. Cell selection state and content updates trigger real-time rendering
3. KaTeX renders individual cells (with auto-scaling) and full matrix preview
4. LaTeX code generation happens automatically with syntax validation
5. Multi-cell operations (copy/paste) update matrix dimensions as needed
6. Selected cells and ranges are highlighted in both table and preview

## Technical Stack

- **Frontend**: React 18 with Hooks and TypeScript
- **Build Tool**: Vite with hot reload
- **Math Rendering**: KaTeX v0.16.8 (CDN loaded) with MathML output
- **Styling**: Tailwind CSS with custom matrix table styles
- **State Management**: React useState for matrix data, selection state, and UI modes
- **Code Quality**: ESLint with TypeScript support

## Development Commands

- **Start development server**: `npm run dev` (runs on http://localhost:3000)
- **Build for production**: `npm run build`
- **Lint code**: `npm run lint`
- **Preview production build**: `npm run preview`

## Development Context

The project is now set up as a modern Node.js application with Vite + React + TypeScript. The main component is in `src/components/LaTeXMatrixEditor.tsx`.

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
- ✅ Full TypeScript implementation with strict type checking
- ✅ Modern Vite + React development environment
- ✅ Comprehensive UI controls with external positioning
- ✅ Advanced selection and editing capabilities
- ✅ KaTeX integration optimized for MathML output
- ✅ Production-ready build system with linting