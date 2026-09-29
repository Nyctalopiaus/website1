# Agent Execution Rules

- **Code Search & Command Execution**: Do not ask the user to manually run `git grep`, `Get-ChildItem`, `Select-String`, `git diff`, or any code search/inspection commands. Perform searches and inspections using internal tools or run commands directly without asking the user to manually execute `git grep`, `Get-ChildItem`, `Select-String`, or `git diff`.
