# Coding Rules and Workflow

## 1. Quality and Self-Correction
* **Self-Correction:** Before declaring a task complete, internally review the generated code for syntax errors, missing brackets, open parentheses, or stray quotation marks.
* **Completeness:** Never leave a diff or code block unfinished. Do not truncate outputs mid-file.
* **Formatting:** Prioritize clean, standard, and highly readable file structures.

## 2. Token Conservation (Local Model Optimization)
* **Conciseness:** Keep conversational responses as brief as possible. Do not explain the code or provide architectural commentary unless explicitly asked.
* **Direct Output:** Focus your generation tokens entirely on the requested code blocks and unified diffs.

## 3. Secure Coding Practices
* **Input Sanitization:** Adhere strictly to secure coding principles. Always sanitize and validate user inputs in forms to mitigate cross-site scripting (XSS) and injection vulnerabilities.
* **Safe DOM Manipulation:** Avoid unsafe methods like `innerHTML` when handling untrusted data; use `textContent`, `createElement`, or safe DOM-binding methodologies instead.
* **Defensive Design:** Ensure all logic aligns with robust industry security baselines.

## 4. File Modification Strictness
* **No Placeholders:** Never output partial code blocks containing placeholders like `// rest of code here` or `// existing logic`. 
* **Full Context blocks:** If modifying a function or an execution block, provide the entire block or function within the diff to ensure Aider can apply it cleanly without guessing.

## 5. UI and Architecture Consistency
* **Tech Stack:** Strictly utilize vanilla JavaScript (ES6+), semantic HTML5, and modern CSS3. Do not import or introduce external frameworks, libraries, or heavy dependencies (e.g., React, Bootstrap) unless explicitly requested.
* **Design Aesthetic:** Maintain a minimalist, modern dark-mode aesthetic for all UI components, ensuring proper spacing, clean layouts, and consistent styling elements.
