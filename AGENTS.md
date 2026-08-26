    # Tool Usage Guidelines

    - **Reading Files:** Always use the dedicated file reading tool (`read_file` / `view_file`) instead of shell commands (`cat`, `type`, `head`, etc.).
    - **Editing Files:** Always use the native edit tool (`replace_file_content` / `edit_file`) for making targeted changes to existing files. Never use `sed`, `awk`, or scripts to modify files.
    - **Writing Files:** Always use the native file creation tool (`write_to_file` / `write_file`) for creating files or complete overwrites. Never use shell redirection (`echo >`, `cat <<EOF`, `Out-File`).
    - **Shell Execution:** Shell commands should only be used for building, testing, linting, or package management tasks.Whenever you make changes to the codebase, add new features, or complete a task, you must automatically create (if it doesn't exist) and update the `README.md` file in the root directory.

When updating the `README.md`, ensure it always reflects the most up-to-date state of the project and includes:
- A clear overview of the project and its purpose.
- Instructions on how to set up or run the project.
- A section with recently implemented features or a changelog.
- A TODO list outlining upcoming tasks or next steps.

Always format the file clearly using Markdown.
