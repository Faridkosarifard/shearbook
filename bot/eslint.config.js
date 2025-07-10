export default [
  {
    files: ["**/*.js"],
    ignores: ["dist", "node_modules"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: true,
        require: true,
        module: true,
        process: true,
        setTimeout: true,
        clearTimeout: true,
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "warn",
      eqeqeq: "error",
    },
  },
];
