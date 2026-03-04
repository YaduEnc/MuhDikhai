# Contributing to PlasticWorld Backend

Thank you for your interest in contributing to PlasticWorld Backend! This document provides guidelines and instructions for contributing.

## 🤝 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yourusername/plasticworld-backend/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, etc.)
   - Error logs if applicable

### Suggesting Features

1. Check existing [Issues](https://github.com/yourusername/plasticworld-backend/issues) and [Discussions](https://github.com/yourusername/plasticworld-backend/discussions)
2. Create a new issue or discussion thread
3. Provide:
   - Clear description of the feature
   - Use cases and benefits
   - Potential implementation approach (if you have ideas)

### Submitting Code

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
   - Follow the code style
   - Write tests for new features
   - Update documentation
   - Add JSDoc comments for public APIs
4. **Test your changes**
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
5. **Commit your changes**
   ```bash
   git commit -m "Add: description of your feature"
   ```
   Use conventional commit messages:
   - `Add:` for new features
   - `Fix:` for bug fixes
   - `Update:` for updates to existing features
   - `Refactor:` for code refactoring
   - `Docs:` for documentation changes
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Create a Pull Request**
   - Provide a clear title and description
   - Reference related issues
   - Request review from maintainers

## 📝 Code Style Guidelines

### TypeScript
- Use TypeScript strict mode
- Prefer interfaces over types for object shapes
- Use `async/await` instead of promises
- Handle errors explicitly

### Naming Conventions
- **Files**: `kebab-case.ts` (e.g., `user.service.ts`)
- **Classes**: `PascalCase` (e.g., `UserService`)
- **Functions/Variables**: `camelCase` (e.g., `getUserProfile`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)

### Code Organization
- Keep functions small and focused
- Use dependency injection where appropriate
- Separate concerns (routes, services, models)
- Add JSDoc comments for public APIs

### Example:
```typescript
/**
 * Get user profile by ID
 * @param userId - User UUID
 * @returns User profile or null if not found
 */
async getUserProfile(userId: string): Promise<User | null> {
  // Implementation
}
```

## 🧪 Testing Guidelines

- Write tests for new features
- Aim for >80% code coverage
- Test both success and error cases
- Use descriptive test names

Example:
```typescript
describe('UserService', () => {
  describe('getUserProfile', () => {
    it('should return user profile when user exists', async () => {
      // Test implementation
    });

    it('should return null when user does not exist', async () => {
      // Test implementation
    });
  });
});
```

## 📚 Documentation

- Update `README.md` for major changes
- Update `API_DOCUMENTATION.md` for API changes
- Add JSDoc comments for new functions/classes
- Update examples if API changes

## 🔍 Review Process

1. All PRs require at least one review
2. Maintainers will review:
   - Code quality and style
   - Test coverage
   - Documentation updates
   - Performance implications
3. Address review comments promptly
4. Once approved, maintainers will merge

## 🐛 Debugging Tips

- Check logs in `logs/` directory
- Use `LOG_LEVEL=debug` for verbose logging
- Test locally with Docker Compose
- Use Postman/Insomnia for API testing

## 📞 Getting Help

- **Questions**: Use [GitHub Discussions](https://github.com/yourusername/plasticworld-backend/discussions)
- **Bugs**: Create an [Issue](https://github.com/yourusername/plasticworld-backend/issues)
- **Security**: Email security@yourdomain.com (don't create public issues)

## 🙏 Thank You!

Your contributions make this project better for everyone. Thank you for taking the time to contribute!
