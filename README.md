# LaTeX Matrix Editor

A modern, interactive web application for visual editing of mathematical matrices with real-time LaTeX preview and generation. Transform tedious text-based LaTeX matrix editing into an intuitive, spreadsheet-like experience.

## ✨ Features

### 🎯 Core Functionality
- **Visual Matrix Editing**: Spreadsheet-like interface with real-time cell editing
- **Multiple Matrix Types**: Support for `matrix`, `pmatrix`, `bmatrix`, `vmatrix`, `Vmatrix`, and `smallmatrix`
- **Real-time KaTeX Rendering**: Live mathematical preview with automatic scaling
- **LaTeX Import/Export**: Bidirectional conversion between visual editor and LaTeX code

### 🎮 Advanced UI Controls
- **Smart Selection**: Single cell, range selection (drag/Shift+click), multi-selection (Ctrl+click)
- **Copy & Paste**: Internal clipboard with TSV compatibility, auto-expands matrix dimensions
- **Dynamic Table Operations**: Hover-based row/column insertion/deletion controls
- **Context Menus**: Right-click operations for efficient matrix management
- **Keyboard Navigation**: Full Tab/arrow key support with Enter for direct cell editing

### 🔧 Specialized Features
- **Symmetric Matrix Mode**: Auto-synchronizes opposite cells in square matrices
- **Selection Highlighting**: Visual feedback in both table and preview
- **Responsive Scaling**: Auto-scaling cell content to fit within boundaries
- **Real-time Validation**: LaTeX parsing with error handling

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd latex-matrix-editor

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` to start editing matrices!

### Production Build
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## 🛠 Technology Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite (with hot reload)
- **Math Rendering**: KaTeX 0.16.8 (CDN)
- **Styling**: Tailwind CSS
- **Code Quality**: ESLint + TypeScript

## 📖 Usage Guide

### Basic Operations
1. **Select Cells**: Click to select, drag for range selection
2. **Edit Content**: Use the cell editor or press Enter on selected cell
3. **Navigate**: Tab/Shift+Tab for sequential navigation, arrow keys for directional movement
4. **Copy/Paste**: Ctrl+C/V for clipboard operations, Ctrl+A to select all

### Matrix Operations
- **Add Rows/Columns**: Use hover controls on headers or right-click context menu
- **Delete Rows/Columns**: Click × buttons or use context menu
- **Change Matrix Type**: Select from dropdown (parentheses, brackets, determinant, etc.)

### Advanced Features
- **Symmetric Mode**: Enable for automatic symmetric matrix editing
- **LaTeX Import**: Paste existing LaTeX matrix code in the code editor
- **Export**: Copy generated LaTeX code for use in documents

## 🏗 Project Structure

```
src/
├── components/
│   └── LaTeXMatrixEditor.tsx  # Main component with full functionality
├── App.tsx                    # Application entry point
├── main.tsx                   # React root
└── index.css                  # Global styles
```

## 📋 Development Commands

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## 🚀 Deployment

This application is optimized for static hosting platforms:

### Recommended Platforms
- **Vercel**: Zero-config deployment with Git integration
- **Netlify**: Drag-and-drop or Git-based deployment
- **GitHub Pages**: Free hosting for public repositories

### Deploy to Vercel
1. Push code to GitHub repository
2. Connect repository to Vercel
3. Automatic deployment with custom domain

### Deploy to Netlify
1. Run `npm run build`
2. Drag `dist` folder to Netlify deploy area
3. Instant deployment with HTTPS

## 🎨 Key Features Showcase

### Matrix Types Support
```latex
\begin{pmatrix} a & b \\ c & d \end{pmatrix}  % Parentheses
\begin{bmatrix} a & b \\ c & d \end{bmatrix}  % Brackets
\begin{vmatrix} a & b \\ c & d \end{vmatrix}  % Determinant
```

### Symmetric Matrix Auto-Sync
When symmetric mode is enabled, editing `a[i][j]` automatically updates `a[j][i]`.

### Real-time LaTeX Generation
Visual edits instantly generate clean, properly formatted LaTeX code ready for academic documents.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with proper TypeScript types
4. Test with `npm run build` and `npm run lint`
5. Submit a pull request

## 📄 License

MIT License - feel free to use this project for academic or commercial purposes.

## 🔗 Links

- [KaTeX Documentation](https://katex.org/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/)