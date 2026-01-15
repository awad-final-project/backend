module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation only changes
        'style',    // Code style changes (formatting, missing semicolons, etc)
        'refactor', // Code refactoring
        'perf',     // Performance improvements
        'test',     // Adding or updating tests
        'chore',    // Maintenance tasks, deps updates
        'ci',       // CI/CD changes
        'revert',   // Revert previous commit
      ],
    ],
    'subject-case': [0], // Allow any case for subject
    'body-max-line-length': [0], // Disable body line length limit
  },
};
