# Contributing to OpenCode Gemini Rotator

Thank you for your interest in improving the Gemini Key Rotator! We welcome community contributions.

## Development Workflow

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-repo/opencode-gemini-rotator.git
    cd opencode-gemini-rotator
    ```

2.  **Install dependencies**:
    We recommend using [Bun](https://bun.sh) for development.
    ```bash
    bun install
    ```

3.  **Make your changes**:
    All source code is located in the `src/` directory.

4.  **Run tests**:
    Ensure your changes don't break existing functionality.
    ```bash
    bun run test
    ```

5.  **Build the project**:
    ```bash
    bun run build
    ```

## Code Quality Standards

-   **Type Safety**: Avoid using `any` types. Ensure all functions and variables are strictly typed.
-   **Testing**: Any new features or bug fixes must include corresponding unit tests in `src/index.test.ts`.
-   **Performance**: Avoid synchronous I/O in the network request path. Use `fs.promises` for any file operations.
-   **Security**: Never commit real API keys to the repository. Use the masked output pattern for logs.

## Submitting a Pull Request

1.  Create a new branch for your feature or fix.
2.  Commit your changes with clear, descriptive messages.
3.  Push your branch and open a Pull Request.
4.  Ensure all CI checks pass.

We look forward to your contributions!
