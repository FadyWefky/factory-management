

### Steps to Download, Set Up, and Run the Application Locally

#### Step 1: Prerequisites
Ensure you have the following installed on your system:
1. **Node.js** (v16 or later):
   - Download and install from [nodejs.org](https://nodejs.org/en/download/).
   - Verify installation:
     ```bash
     node -v
     npm -v
     ```
2. **PostgreSQL** (v13 or later):
   - **Windows**: Download the installer from [postgresql.org](https://www.postgresql.org/download/windows/).
   - **Linux**: Install via package manager (e.g., `sudo apt install postgresql postgresql-contrib` on Ubuntu).
   - Verify installation:
     ```bash
     psql --version
     ```
3. **Git** (optional, for cloning a repository if you host the code):
   - Install from [git-scm.com](https://git-scm.com/downloads).
   - Verify:
     ```bash
     git --version
     ```
4. A code editor (e.g., VS Code) for editing files.

---

#### Step 2: Create the Project Directory
1. Create a new directory for the project:
   ```bash
   mkdir factory-management
   cd factory-management
   ```
2. Initialize a Node.js project:
   ```bash
   npm init -y
   ```
   This creates a `package.json` file.

---

#### Step 3: Add the Provided Code Files
Create the following files in the `factory-management` directory with the content provided in the artifacts:

1. **package.json**:
   Replace the generated `package.json` with:
   ```json
   {
     "name": "factory-management",
     "version": "1.0.0",
     "main": "main.js",
     "scripts": {
       "start": "electron ."
     },
     "dependencies": {
       "electron": "^22.0.0",
       "pg": "^8.7.3",
       "exceljs": "^4.3.0"
     }
   }
   ```

2. **index.html**:
   Create `index.html` with the provided HTML content. This includes the Arabic interface with Tailwind CSS and navigation for clients, capital, expenses, purchases, manufacturing, sales, and credit sales.

3. **main.js**:
   Create `main.js` with the provided Electron main process code to set up the desktop window.

4. **renderer.js**:
   Create `renderer.js` with the provided renderer process code, which handles database interactions, UI logic, and Excel exports.

**Note**: You can copy the content of these files from the artifacts provided earlier. If you prefer, you can place the code in a Git repository (e.g., GitHub) and clone it:
```bash
git clone <your-repository-url>
cd factory-management
```

---

#### Step 4: Install Dependencies
1. In the `factory-management` directory, install the required Node.js packages:
   ```bash
   npm install
   ```
   This installs:
   - `electron`: For the desktop application framework.
   - `pg`: PostgreSQL client for Node.js.
   - `exceljs`: For exporting reports to Excel.

2. Verify that the `node_modules` folder is created in the project directory.

---

#### Step 5: Set Up PostgreSQL Database
1. **Start PostgreSQL**:
   - **Windows**:
     - If installed via the PostgreSQL installer, the service may already be running.
     - Start it manually if needed:
       ```bash
       net start postgresql-x64-<version>
       ```
       Replace `<version>` with your PostgreSQL version (e.g., `15`).
   - **Linux**:
     - Start and enable the PostgreSQL service:
       ```bash
       sudo systemctl start postgresql
       sudo systemctl enable postgresql
       ```

2. **Set PostgreSQL Password**:
   - **Windows**:
     - During installation, you set a password for the `postgres` user. If not, use `pgAdmin` or `psql` to set it:
       ```bash
       psql -U postgres
       \password postgres
       ```
       Enter `your_password` when prompted.
   - **Linux**:
     - Set the password for the `postgres` user:
       ```bash
       sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'your_password';"
       ```

3. **Create the Database**:
   - Create a database named `factory_management`:
     - **Windows** (via `cmd` or PowerShell):
       ```bash
       createdb -U postgres factory_management
       ```
       Enter the password (`your_password`) when prompted.
     - **Linux**:
       ```bash
       sudo -u postgres createdb factory_management
       ```

4. **Configure Database Connection**:
   - Open `renderer.js` and update the PostgreSQL connection settings:
     ```javascript
     const pool = new Pool({
       user: 'postgres',
       host: 'localhost',
       database: 'factory_management',
       password: 'your_password', // Replace with your actual password
       port: 5432,
     });
     ```
   - Ensure the `password` matches the one set for the `postgres` user.

5. **Initialize Database Tables**:
   - The `renderer.js` file automatically creates the required tables (`clients`, `orders`, `capital`, `expenses`, `purchases`, `products`, `product_steps`, `sales`) when the app starts, via the `initDatabase` function.

---

#### Step 6: Run the Application
1. In the `factory-management` directory, start the Electron app:
   ```bash
   npm start
   ```
2. This launches the desktop application with the Arabic interface, featuring:
   - A blue-themed navigation bar.
   - Tabs for managing clients, capital, expenses, purchases, manufacturing, sales, and credit sales.
   - Modals for adding clients, updating capital, and adding products with manufacturing steps.
   - Excel export functionality for client reports.

---

#### Step 7: Test Excel Export
1. Navigate to the "العملاء" (Clients) tab, add a client, and create some orders.
2. Click "تصدير إلى Excel" to generate a report.
3. Check the project directory for a file named `client_<clientId>_report.xlsx`.
4. Ensure the project directory has write permissions:
   - **Windows**: Right-click the folder, go to Properties > Security, and grant write access to your user.
   - **Linux**:
     ```bash
     chmod -R 755 /path/to/factory-management
     ```

---

#### Troubleshooting
- **Database Connection Issues**:
  - Verify PostgreSQL is running:
    - **Windows**: `net start postgresql-x64-<version>`
    - **Linux**: `sudo systemctl status postgresql`
  - Ensure the `password`, `database`, and `port` in `renderer.js` are correct.
  - If `localhost` doesn't work, try `127.0.0.1` for the `host`.
- **Node Modules Errors**:
  - Delete the `node_modules` folder and `package-lock.json`, then run:
    ```bash
    npm install
    ```
- **Excel Export Fails**:
  - Check for write permissions in the project directory.
  - Ensure `exceljs` is installed (`npm install exceljs`).
- **Electron Fails to Start**:
  - Ensure `electron` is installed (`npm install electron`).
  - Run `npm start` from the correct directory.

---

#### Notes
- **Design**: The app uses Tailwind CSS for a modern, responsive design with RTL support and the `Cairo` font for Arabic text. The interface is clean, with card-based layouts and a blue navigation bar.
- **Excel Reports**: Client reports include order details, amounts, payments, and remaining balances, exported as `.xlsx` files.
- **Cross-Platform**: The setup works on both Windows and Linux with minimal differences.
- **Security**: Replace `your_password` with a secure password and consider using environment variables for sensitive data in production.

You now have a fully functional factory management app running locally with all the requested features! If you encounter issues or need further customization, let me know.