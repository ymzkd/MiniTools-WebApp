import React from 'react';
import { Link } from 'react-router-dom';
import { Calculator, Image, FileText, PenLine, MapPin } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import type { AppTab } from '../../types';

interface NavigationProps {
  activeTab: AppTab;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab }) => {
  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors duration-200 print:hidden">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 3xl:px-12 4xl:px-16">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex space-x-8">
              <Link
                to="/matrix"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === 'matrix'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Calculator className="w-4 h-4 mr-2" />
                Matrix Editor
              </Link>
              
              <Link
                to="/figure"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === 'figure'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Image className="w-4 h-4 mr-2" />
                Figure Layout
              </Link>
              
              <Link
                to="/pdf"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === 'pdf'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF Converter
              </Link>

              <Link
                to="/markdown"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === 'markdown'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <PenLine className="w-4 h-4 mr-2" />
                Markdown Editor
              </Link>

              <Link
                to="/boring"
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                  activeTab === 'boring'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <MapPin className="w-4 h-4 mr-2" />
                Boring Data
              </Link>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200">
              Mini Tools
            </h1>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
