const { ipcRenderer } = require('electron');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'factory_management',
  password: 'test',
  port: 5432,
});

let currentClientId = null;
let currentOrderId = null;

async function initDatabase() {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const connTest = await pool.query('SELECT NOW()');
      console.log('Database connection successful at:', connTest.rows[0].now);

      // Check if tables exist, create only if they don't
      const checkTable = await pool.query(`
        SELECT EXISTS (
          SELECT FROM pg_tables
          WHERE schemaname = 'public' AND tablename = 'clients'
        ) AS clients_exists
      `);
      if (!checkTable.rows[0].clients_exists) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS clients (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
            quantity INTEGER NOT NULL DEFAULT 0,
            details TEXT NOT NULL,
            amount NUMERIC NOT NULL DEFAULT 0,
            paid NUMERIC DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS capital (
            id SERIAL PRIMARY KEY,
            amount NUMERIC NOT NULL DEFAULT 0,
            reason TEXT,
            type TEXT NOT NULL CHECK (type IN ('add', 'withdraw')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            type TEXT NOT NULL,
            amount NUMERIC NOT NULL DEFAULT 0,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS purchases (
            id SERIAL PRIMARY KEY,
            type TEXT NOT NULL,
            amount NUMERIC NOT NULL DEFAULT 0,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            total_cost NUMERIC NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS product_steps (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            details TEXT NOT NULL,
            cost NUMERIC NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS sales (
            id SERIAL PRIMARY KEY,
            client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
            product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
            amount NUMERIC NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('Database schema created successfully');
      } else {
        console.log('Database schema already exists, skipping creation');
      }
      break;
    } catch (error) {
      attempts++;
      console.error(`Database initialization attempt ${attempts} failed:`, error.stack);
      if (attempts === maxAttempts) {
        alert('فشل في الاتصال بقاعدة البيانات بعد 3 محاولات: ' + error.message);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  if (tabId === 'clients') loadClients();
  if (tabId === 'capital') loadCapital();
  if (tabId === 'expenses') loadExpenses();
  if (tabId === 'purchases') loadPurchases();
  if (tabId === 'manufacturing') loadProducts();
  if (tabId === 'sales') loadSales();
  if (tabId === 'credit') loadCredit();
}

async function loadClients() {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY name');
    console.log('Clients data:', result.rows);
    const clientList = document.getElementById('clientList');
    clientList.innerHTML = '';
    if (!result.rows || result.rows.length === 0) {
      clientList.innerHTML = '<p class="text-gray-500">لا توجد عملاء</p>';
    } else {
      result.rows.forEach(client => {
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
        div.innerHTML = `
          <div>
            <h3 class="text-lg font-bold">${client.name}</h3>
            <button onclick="viewClient(${client.id})" class="bg-blue-500 text-white px-2 py-1 rounded">عرض التفاصيل</button>
          </div>
          <button onclick="deleteClient(${client.id})" class="bg-red-500 text-white px-2 py-1 rounded">مسح</button>
        `;
        clientList.appendChild(div);
      });
    }
  } catch (error) {
    console.error('Error loading clients:', error.stack);
    alert('خطأ في تحميل العملاء: ' + error.message);
  }
}

async function deleteClient(clientId) {
  if (confirm('هل أنت متأكد من مسح هذا العميل؟ سيتم مسح جميع طلبياته.')) {
    try {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error.stack);
      alert('خطأ في مسح العميل: ' + error.message);
    }
  }
}

async function viewClient(clientId) {
  currentClientId = clientId;
  try {
    const client = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
    if (client.rows.length === 0) {
      alert('العميل غير موجود');
      loadClients();
      return;
    }
    const orders = await pool.query('SELECT * FROM orders WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
    console.log('Orders data for client', clientId, ':', orders.rows);
    const clientList = document.getElementById('clientList');
    clientList.innerHTML = `
      <h3 class="text-lg font-bold mb-4">${client.rows[0].name}</h3>
      <button onclick="openAddOrderModal()" class="bg-green-500 text-white px-4 py-2 rounded mb-4">إضافة طلبية</button>
      <button onclick="exportClientToExcel(${clientId})" class="bg-blue-500 text-white px-4 py-2 rounded mb-4">تصدير إلى Excel</button>
      <div id="orderList" class="grid grid-cols-1 gap-4"></div>
    `;
    if (orders.rows.length === 0) {
      document.getElementById('orderList').innerHTML = '<p class="text-gray-500">لا توجد طلبيات لهذا العميل</p>';
    } else {
      orders.rows.forEach(order => {
        const amount = Number(order.amount) || 0;
        const paid = Number(order.paid) || 0;
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
        div.innerHTML = `
          <div>
            <p>الكمية: ${order.quantity}</p>
            <p>التفاصيل: ${order.details}</p>
            <p>المبلغ: ${amount.toFixed(2)}</p>
            <p>المدفوع: ${paid.toFixed(2)}</p>
            <p>المتبقي: ${(amount - paid).toFixed(2)}</p>
            <p>التاريخ: ${new Date(order.created_at).toLocaleString('ar-EG')}</p>
            <button onclick="editOrder(${order.id})" class="bg-yellow-500 text-white px-2 py-1 rounded mt-2">تعديل</button>
          </div>
          <button onclick="deleteOrder(${order.id})" class="bg-red-500 text-white px-2 py-1 rounded">مسح</button>
        `;
        document.getElementById('orderList').appendChild(div);
      });
    }
  } catch (error) {
    console.error('Error loading client details:', error.stack);
    alert('خطأ في تحميل تفاصيل العميل: ' + error.message);
  }
}

async function addClient() {
  const name = document.getElementById('clientName').value.trim();
  if (!name) {
    alert('يرجى إدخال اسم العميل');
    return;
  }
  try {
    await pool.query('INSERT INTO clients (name) VALUES ($1)', [name]);
    closeModal('addClientModal');
    loadClients();
  } catch (error) {
    console.error('Error adding client:', error.stack);
    alert('خطأ في إضافة العميل: ' + error.message);
  }
}

function openAddOrderModal() {
  document.getElementById('orderModalTitle').innerText = 'إضافة طلبية';
  document.getElementById('orderQuantity').value = '';
  document.getElementById('orderDetails').value = '';
  document.getElementById('orderAmount').value = '';
  document.getElementById('orderPaid').value = '';
  currentOrderId = null;
  document.getElementById('addOrderModal').classList.remove('hidden');
}

async function editOrder(orderId) {
  try {
    const order = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (order.rows.length === 0) {
      alert('الطلبية غير موجودة');
      return;
    }
    document.getElementById('orderModalTitle').innerText = 'تعديل طلبية';
    document.getElementById('orderQuantity').value = order.rows[0].quantity;
    document.getElementById('orderDetails').value = order.rows[0].details;
    document.getElementById('orderAmount').value = order.rows[0].amount;
    document.getElementById('orderPaid').value = order.rows[0].paid;
    currentOrderId = orderId;
    document.getElementById('addOrderModal').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading order for edit:', error.stack);
    alert('خطأ في تحميل الطلبية للتعديل: ' + error.message);
  }
}

async function saveOrder() {
  const quantity = parseInt(document.getElementById('orderQuantity').value);
  const details = document.getElementById('orderDetails').value.trim();
  const amount = parseFloat(document.getElementById('orderAmount').value);
  const paid = parseFloat(document.getElementById('orderPaid').value) || 0;

  if (!currentClientId) {
    alert('يرجى تحديد عميل أولاً');
    return;
  }
  if (isNaN(quantity) || quantity <= 0) {
    alert('يرجى إدخال كمية صحيحة (أكبر من 0)');
    return;
  }
  if (!details) {
    alert('يرجى إدخال تفاصيل الطلبية');
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    alert('يرجى إدخال مبلغ صحيح (أكبر من 0)');
    return;
  }
  if (isNaN(paid) || paid < 0) {
    alert('المبلغ المدفوع لا يمكن أن يكون سالبًا');
    return;
  }
  if (paid > amount) {
    alert('المبلغ المدفوع لا يمكن أن يتجاوز المبلغ الإجمالي');
    return;
  }

  try {
    if (currentOrderId) {
      await pool.query(
        'UPDATE orders SET quantity = $1, details = $2, amount = $3, paid = $4 WHERE id = $5',
        [quantity, details, amount, paid, currentOrderId]
      );
      console.log(`Updated order ID ${currentOrderId} for client ID ${currentClientId}`);
    } else {
      await pool.query(
        'INSERT INTO orders (client_id, quantity, details, amount, paid) VALUES ($1, $2, $3, $4, $5)',
        [currentClientId, quantity, details, amount, paid]
      );
      console.log(`Inserted new order for client ID ${currentClientId}`);
    }
    closeModal('addOrderModal');
    viewClient(currentClientId);
    alert('تم حفظ الطلبية بنجاح');
  } catch (error) {
    console.error('Error saving order:', error.stack);
    alert('خطأ في حفظ الطلبية: ' + error.message);
  }
}

async function deleteOrder(orderId) {
  if (confirm('هل أنت متأكد من مسح هذه الطلبية؟')) {
    try {
      await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
      viewClient(currentClientId);
    } catch (error) {
      console.error('Error deleting order:', error.stack);
      alert('خطأ في مسح الطلبية: ' + error.message);
    }
  }
}

async function loadCapital() {
  try {
    const result = await pool.query('SELECT SUM(amount) as total FROM capital WHERE type = $1', ['add']);
    const withdrawals = await pool.query('SELECT SUM(amount) as total FROM capital WHERE type = $1', ['withdraw']);
    const total = (Number(result.rows[0]?.total) || 0) - (Number(withdrawals.rows[0]?.total) || 0);
    console.log('Capital total:', total, 'Type:', typeof total);
    document.getElementById('capitalAmount').innerText = `المبلغ الحالي: ${total.toFixed(2)}`;
    const history = await pool.query('SELECT * FROM capital ORDER BY created_at DESC');
    console.log('Capital history:', history.rows);
    const capitalHistory = document.getElementById('capitalHistory');
    capitalHistory.innerHTML = '';
    if (!history.rows || history.rows.length === 0) {
      capitalHistory.innerHTML = '<p class="text-gray-500">لا توجد عمليات رأس مال</p>';
    } else {
      history.rows.forEach(entry => {
        const amount = Number(entry.amount) || 0;
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
        div.innerHTML = `
          <div>
            <p>المبلغ: ${amount.toFixed(2)}</p>
            <p>النوع: ${entry.type === 'add' ? 'إضافة' : 'سحب'}</p>
            <p>السبب: ${entry.reason || 'بدون سبب'}</p>
            <p>التاريخ: ${new Date(entry.created_at).toLocaleString('ar-EG')}</p>
          </div>
          <button onclick="deleteCapital(${entry.id})" class="bg-red-500 text-white px-2 py-1 rounded">مسح</button>
        `;
        capitalHistory.appendChild(div);
      });
    }
  } catch (error) {
    console.error('Error loading capital:', error.stack);
    alert('خطأ في تحميل رأس المال: ' + error.message);
  }
}

async function deleteCapital(capitalId) {
  if (confirm('هل أنت متأكد من مسح هذه العملية؟')) {
    try {
      await pool.query('DELETE FROM capital WHERE id = $1', [capitalId]);
      loadCapital();
    } catch (error) {
      console.error('Error deleting capital:', error.stack);
      alert('خطأ في مسح العملية: ' + error.message);
    }
  }
}

async function updateCapital() {
  const amount = parseFloat(document.getElementById('capitalChangeAmount').value);
  const reason = document.getElementById('capitalChangeReason').value.trim();
  const type = document.getElementById('capitalChangeType').value;
  if (isNaN(amount) || amount <= 0) {
    alert('يرجى إدخال مبلغ صحيح');
    return;
  }
  if (!['add', 'withdraw'].includes(type)) {
    alert('نوع العملية يجب أن يكون إضافة أو سحب');
    return;
  }
  try {
    await pool.query('INSERT INTO capital (amount, reason, type) VALUES ($1, $2, $3)', [amount, reason, type]);
    closeModal('capitalModal');
    loadCapital();
  } catch (error) {
    console.error('Error updating capital:', error.stack);
    alert('خطأ في تحديث رأس المال: ' + error.message);
  }
}

async function loadExpenses() {
  try {
    const result = await pool.query('SELECT * FROM expenses ORDER BY created_at DESC');
    console.log('Expenses data:', result.rows);
    const expenseList = document.getElementById('expenseList');
    expenseList.innerHTML = '';
    if (!result.rows || result.rows.length === 0) {
      expenseList.innerHTML = '<p class="text-gray-500">لا توجد مصاريف</p>';
    } else {
      result.rows.forEach(expense => {
        const amount = Number(expense.amount) || 0;
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
        div.innerHTML = `
          <div>
            <p>النوع: ${expense.type}</p>
            <p>المبلغ: ${amount.toFixed(2)}</p>
            <p>التفاصيل: ${expense.details || 'بدون تفاصيل'}</p>
            <p>التاريخ: ${new Date(expense.created_at).toLocaleString('ar-EG')}</p>
          </div>
          <button onclick="deleteExpense(${expense.id})" class="bg-red-500 text-white px-2 py-1 rounded">مسح</button>
        `;
        expenseList.appendChild(div);
      });
    }
  } catch (error) {
    console.error('Error loading expenses:', error.stack);
    alert('خطأ في تحميل المصاريف: ' + error.message);
  }
}

async function deleteExpense(expenseId) {
  if (confirm('هل أنت متأكد من مسح هذه المصروفات؟')) {
    try {
      await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
      loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error.stack);
      alert('خطأ في مسح المصروفات: ' + error.message);
    }
  }
}

async function addExpense() {
  const type = document.getElementById('expenseType').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const details = document.getElementById('expenseDetails').value.trim();
  if (isNaN(amount) || amount <= 0) {
    alert('يرجى إدخال مبلغ صحيح');
    return;
  }
  if (!type) {
    alert('يرجى إدخال نوع المصروفات');
    return;
  }
  try {
    await pool.query('INSERT INTO expenses (type, amount, details) VALUES ($1, $2, $3)', [type, amount, details]);
    await pool.query('INSERT INTO capital (amount, reason, type) VALUES ($1, $2, $3)', [amount, `مصاريف: ${details}`, 'withdraw']);
    loadExpenses();
  } catch (error) {
    console.error('Error adding expense:', error.stack);
    alert('خطأ في إضافة المصروفات: ' + error.message);
  }
}

async function loadPurchases() {
  try {
    const result = await pool.query('SELECT * FROM purchases ORDER BY created_at DESC');
    console.log('Purchases data:', result.rows);
    const purchaseList = document.getElementById('purchaseList');
    purchaseList.innerHTML = '';
    if (!result.rows || result.rows.length === 0) {
      purchaseList.innerHTML = '<p class="text-gray-500">لا توجد مشتريات</p>';
    } else {
      result.rows.forEach(purchase => {
        const amount = Number(purchase.amount) || 0;
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
        div.innerHTML = `
          <div>
            <p>النوع: ${purchase.type}</p>
            <p>المبلغ: ${amount.toFixed(2)}</p>
            <p>التفاصيل: ${purchase.details || 'بدون تفاصيل'}</p>
            <p>التاريخ: ${new Date(purchase.created_at).toLocaleString('ar-EG')}</p>
          </div>
          <button onclick="deletePurchase(${purchase.id})" class="bg-red-500 text-white px-2 py-1 rounded">مسح</button>
        `;
        purchaseList.appendChild(div);
      });
    }
  } catch (error) {
    console.error('Error loading purchases:', error.stack);
    alert('خطأ في تحميل المشتريات: ' + error.message);
  }
}

async function deletePurchase(purchaseId) {
  if (confirm('هل أنت متأكد من مسح هذا الشراء؟')) {
    try {
      await pool.query('DELETE FROM purchases WHERE id = $1', [purchaseId]);
      loadPurchases();
    } catch (error) {
      console.error('Error deleting purchase:', error.stack);
      alert('خطأ في مسح الشراء: ' + error.message);
    }
  }
}

async function addPurchase() {
  const type = document.getElementById('purchaseType').value.trim();
  const amount = parseFloat(document.getElementById('purchaseAmount').value);
  const details = document.getElementById('purchaseDetails').value.trim();
  if (isNaN(amount) || amount <= 0) {
    alert('يرجى إدخال مبلغ صحيح');
    return;
  }
  if (!type) {
    alert('يرجى إدخال نوع المشتريات');
    return;
  }
  try {
    await pool.query('INSERT INTO purchases (type, amount, details) VALUES ($1, $2, $3)', [type, amount, details]);
    await pool.query('INSERT INTO capital (amount, reason, type) VALUES ($1, $2, $3)', [amount, `مشتريات: ${details}`, 'withdraw']);
    loadPurchases();
  } catch (error) {
    console.error('Error adding purchase:', error.stack);
    alert('خطأ في إضافة المشتريات: ' + error.message);
  }
}

async function loadProducts() {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY name');
    console.log('Products data:', result.rows);
    const productList = document.getElementById('productList');
    productList.innerHTML = '';
    if (!result.rows || result.rows.length === 0) {
      productList.innerHTML = '<p class="text-gray-500">لا توجد منتجات</p>';
    } else {
      for (const product of result.rows) {
        const steps = await pool.query('SELECT * FROM product_steps WHERE product_id = $1', [product.id]);
        const totalCost = Number(product.total_cost) || 0;
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
        div.innerHTML = `
          <div>
            <h3 class="text-lg font-bold">${product.name}</h3>
            <p>التكلفة الإجمالية: ${totalCost.toFixed(2)}</p>
            <h4>خطوات التصنيع:</h4>
            <ul>${steps.rows.map(step => `<li>${step.details}: ${(Number(step.cost) || 0).toFixed(2)}</li>`).join('') || '<li>لا توجد خطوات</li>'}</ul>
          </div>
          <button onclick="deleteProduct(${product.id})" class="bg-red-500 text-white px-2 py-1 rounded">مسح</button>
        `;
        productList.appendChild(div);
      }
    }
  } catch (error) {
    console.error('Error loading products:', error.stack);
    alert('خطأ في تحميل المنتجات: ' + error.message);
  }
}

async function deleteProduct(productId) {
  if (confirm('هل أنت متأكد من مسح هذا المنتج؟')) {
    try {
      await pool.query('DELETE FROM products WHERE id = $1', [productId]);
      loadProducts();
    } catch (error) {
      console.error('Error deleting product:', error.stack);
      alert('خطأ في مسح المنتج: ' + error.message);
    }
  }
}

async function addProduct() {
  const name = document.getElementById('productName').value.trim();
  if (!name) {
    alert('يرجى إدخال اسم المنتج');
    return;
  }
  const steps = Array.from(document.getElementById('productSteps').children).map(child => ({
    details: child.querySelector('.step-details').value.trim(),
    cost: parseFloat(child.querySelector('.step-cost').value) || 0,
  }));
  const totalCost = steps.reduce((sum, step) => sum + (step.cost || 0), 0);
  try {
    const productResult = await pool.query('INSERT INTO products (name, total_cost) VALUES ($1, $2) RETURNING id', [name, totalCost]);
    const productId = productResult.rows[0].id;
    for (const step of steps) {
      if (step.details) {
        await pool.query('INSERT INTO product_steps (product_id, details, cost) VALUES ($1, $2, $3)', [productId, step.details, step.cost]);
      }
    }
    closeModal('addProductModal');
    loadProducts();
  } catch (error) {
    console.error('Error adding product:', error.stack);
    alert('خطأ في إضافة المنتج: ' + error.message);
  }
}

function addProductStep() {
  const stepDiv = document.createElement('div');
  stepDiv.className = 'flex space-x-4 mb-2';
  stepDiv.innerHTML = `
    <input type="text" class="step-details p-2 border rounded" placeholder="تفاصيل الخطوة">
    <input type="number" class="step-cost p-2 border rounded" placeholder="التكلفة" min="0" step="0.01">
  `;
  document.getElementById('productSteps').appendChild(stepDiv);
}

async function loadSales() {
  try {
    const result = await pool.query(`
      SELECT s.*, c.name as client_name, p.name as product_name 
      FROM sales s 
      JOIN clients c ON s.client_id = c.id 
      JOIN products p ON s.product_id = p.id
      ORDER BY s.created_at DESC
    `);
    console.log('Sales data:', result.rows);
    const salesList = document.getElementById('salesList');
    salesList.innerHTML = '';
    if (!result.rows || result.rows.length === 0) {
      salesList.innerHTML = '<p class="text-gray-500">لا توجد مبيعات</p>';
    } else {
      result.rows.forEach(sale => {
        const amount = Number(sale.amount) || 0;
        const div = document.createElement('div');
        div.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
        div.innerHTML = `
          <div>
            <p>العميل: ${sale.client_name}</p>
            <p>المنتج: ${sale.product_name}</p>
            <p>المبلغ: ${amount.toFixed(2)}</p>
            <p>التاريخ: ${new Date(sale.created_at).toLocaleString('ar-EG')}</p>
          </div>
          <button onclick="deleteSale(${sale.id})" class="bg-red-500 text-white px-2 py-1 rounded">مسح</button>
        `;
        salesList.appendChild(div);
      });
    }
  } catch (error) {
    console.error('Error loading sales:', error.stack);
    alert('خطأ في تحميل المبيعات: ' + error.message);
  }
}

async function deleteSale(saleId) {
  if (confirm('هل أنت متأكد من مسح هذه المبيعة؟')) {
    try {
      await pool.query('DELETE FROM sales WHERE id = $1', [saleId]);
      loadSales();
    } catch (error) {
      console.error('Error deleting sale:', error.stack);
      alert('خطأ في مسح المبيعة: ' + error.message);
    }
  }
}

async function loadCredit() {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, o.id as order_id, o.quantity, o.details, o.amount, o.paid, o.created_at
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      ORDER BY c.name, o.created_at DESC
    `);
    console.log('Credit data:', result.rows);
    const creditList = document.getElementById('creditList');
    creditList.innerHTML = '';
    const clients = {};
    result.rows.forEach(row => {
      if (!clients[row.id]) {
        clients[row.id] = { name: row.name, orders: [] };
      }
      if (row.order_id) {
        clients[row.id].orders.push({
          id: row.order_id,
          quantity: row.quantity,
          details: row.details,
          amount: Number(row.amount) || 0,
          paid: Number(row.paid) || 0,
          remaining: (Number(row.amount) || 0) - (Number(row.paid) || 0),
          created_at: row.created_at,
        });
      }
    });
    for (const clientId in clients) {
      const client = clients[clientId];
      const div = document.createElement('div');
      div.className = 'bg-white p-4 rounded shadow';
      div.innerHTML = `
        <h3 class="text-lg font-bold">${client.name}</h3>
        <h4>الطلبيات:</h4>
        <ul class="grid grid-cols-1 gap-2">
          ${client.orders.length ? client.orders.map(order => `
            <li class="bg-gray-100 p-2 rounded">
              <p>الكمية: ${order.quantity}</p>
              <p>التفاصيل: ${order.details}</p>
              <p>المبلغ: ${order.amount.toFixed(2)}</p>
              <p>المدفوع: ${order.paid.toFixed(2)}</p>
              <p>المتبقي: ${order.remaining.toFixed(2)}</p>
              <p>التاريخ: ${new Date(order.created_at).toLocaleString('ar-EG')}</p>
            </li>
          `).join('') : '<li>لا توجد طلبيات</li>'}
        </ul>
      `;
      creditList.appendChild(div);
    }
  } catch (error) {
    console.error('Error loading credit:', error.stack);
    alert('خطأ في تحميل البيع بالأجل: ' + error.message);
  }
}

async function exportClientToExcel(clientId) {
  try {
    const client = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
    if (client.rows.length === 0) {
      alert('العميل غير موجود');
      return;
    }
    const orders = await pool.query('SELECT * FROM orders WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('بيانات العميل');
    worksheet.columns = [
      { header: 'الكمية', key: 'quantity', width: 15 },
      { header: 'التفاصيل', key: 'details', width: 30 },
      { header: 'المبلغ', key: 'amount', width: 15 },
      { header: 'المدفوع', key: 'paid', width: 15 },
      { header: 'المتبقي', key: 'remaining', width: 15 },
      { header: 'التاريخ', key: 'created_at', width: 20 },
    ];
    orders.rows.forEach(order => {
      worksheet.addRow({
        quantity: order.quantity,
        details: order.details,
        amount: Number(order.amount) || 0,
        paid: Number(order.paid) || 0,
        remaining: (Number(order.amount) || 0) - (Number(order.paid) || 0),
        created_at: new Date(order.created_at).toLocaleString('ar-EG'),
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const fs = require('fs');
    fs.writeFileSync(`client_${clientId}_report.xlsx`, buffer);
    alert('تم تصدير التقرير إلى ملف Excel');
  } catch (error) {
    console.error('Error exporting to Excel:', error.stack);
    alert('خطأ في تصدير التقرير: ' + error.message);
  }
}

function openAddClientModal() {
  document.getElementById('addClientModal').classList.remove('hidden');
}

function openCapitalModal() {
  document.getElementById('capitalModal').classList.remove('hidden');
}

function openAddProductModal() {
  document.getElementById('addProductModal').classList.remove('hidden');
  document.getElementById('productSteps').innerHTML = '';
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

initDatabase();
showTab('clients');