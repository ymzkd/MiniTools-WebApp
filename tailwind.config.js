/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // クラスベースのダークモード
  theme: {
    extend: {
      // 幅広モニター対応のための追加ブレークポイント
      screens: {
        '3xl': '1920px',  // フルHD幅広モニター
        '4xl': '2560px',  // 4K/ウルトラワイドモニター
        '5xl': '3840px',  // 4K+/超幅広モニター
      },
      // 追加の最大幅クラス
      maxWidth: {
        '8xl': '1440px',  // 7xlより少し大きめ
        '9xl': '1728px',  // さらに大きめ
        '10xl': '1920px', // フルHD幅
        '11xl': '2048px', // 超幅広
      }
    },
  },
  plugins: [],
}