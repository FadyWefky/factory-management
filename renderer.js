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
          
      CREATE TABLE IF NOT EXISTS product_sales (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        sale_type TEXT NOT NULL CHECK (sale_type IN ('retail', 'wholesale')),
        total_amount NUMERIC NOT NULL DEFAULT 0,
        paid_amount NUMERIC NOT NULL DEFAULT 0,
        remaining_amount NUMERIC NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
        `);
        console.log('Database schema created successfully');
      } else {
        try {
          await pool.query('SELECT 1 FROM product_sales LIMIT 1');
          console.log('product_sales table exists');
        } catch (e) {
          console.log('Creating product_sales table');
          await pool.query(`
            CREATE TABLE IF NOT EXISTS product_sales (
              id SERIAL PRIMARY KEY,
              product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
              quantity INTEGER NOT NULL DEFAULT 1,
              sale_type TEXT NOT NULL CHECK (sale_type IN ('retail', 'wholesale')),
              total_amount NUMERIC NOT NULL DEFAULT 0,
              paid_amount NUMERIC NOT NULL DEFAULT 0,
              remaining_amount NUMERIC NOT NULL DEFAULT 0,
              notes TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
        }
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
            <h3 class="text-lg font-bold text-teal-900">${client.name}</h3>
            <button onclick="viewClient(${client.id})" class="bg-sky-900 text-white px-2 py-1 rounded">عرض التفاصيل</button>
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
      <h3 class="text-2xl font-bold mb-4 text-teal-900">${client.rows[0].name}</h3>
      <button onclick="openAddOrderModal()" class="bg-green-700 text-white px-4 py-2 rounded mb-4 w-40">إضافة طلبية</button>
      <button onclick="exportClientToExcel(${clientId})" class="bg-blue-900 text-white px-4 py-2 rounded mb-4 w-40">تصدير إلى Excel</button>
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
      SELECT ps.*, p.name as product_name 
      FROM product_sales ps
      LEFT JOIN products p ON ps.product_id = p.id
      ORDER BY ps.created_at DESC
    `);
    
    const salesTableBody = document.getElementById('salesTableBody');
    if (!salesTableBody) {
      console.error('Sales table body element not found');
      return;
    }
    
    salesTableBody.innerHTML = '';
    
    if (!result.rows || result.rows.length === 0) {
      salesTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="p-4 text-center text-gray-500">لا توجد مبيعات مسجلة</td>
        </tr>
      `;
    } else {
      result.rows.forEach(sale => {
        const totalAmount = Number(sale.total_amount) || 0;
        const paidAmount = Number(sale.paid_amount) || 0;
        const remainingAmount = Number(sale.remaining_amount) || 0;
        const quantity = Number(sale.quantity) || 0;
        
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50';
        row.innerHTML = `
          <td class="p-3">${sale.product_name || 'غير محدد'}</td>
          <td class="p-3">${quantity}</td>
          <td class="p-3">${sale.sale_type === 'retail' ? 'قطاعي' : 'جملة'}</td>
          <td class="p-3">${totalAmount.toFixed(2)}</td>
          <td class="p-3">${paidAmount.toFixed(2)}</td>
          <td class="p-3">${remainingAmount.toFixed(2)}</td>
          <td class="p-3">${new Date(sale.created_at).toLocaleString('ar-EG')}</td>
          <td class="p-3">${sale.notes || '-'}</td>
          <td class="p-3">
            <button onclick="deleteSale(${sale.id})" class="bg-red-500 text-white px-2 py-1 rounded text-sm">حذف</button>
          </td>
        `;
        salesTableBody.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error loading sales:', error.stack);
    showAlert('error', 'خطأ في تحميل المبيعات: ' + error.message);
  }
}

async function getProductName(productId) {
  if (!productId) return 'غير محدد';
  
  try {
    const result = await pool.query('SELECT name FROM products WHERE id = $1', [productId]);
    return result.rows[0]?.name || 'غير محدد';
  } catch (error) {
    console.error('Error getting product name:', error);
    return 'غير محدد';
  }
}

async function deleteSale(saleId) {
  try {
    const saleResult = await pool.query('SELECT * FROM product_sales WHERE id = $1', [saleId]);
    
    if (saleResult.rows.length === 0) {
      throw new Error('عملية البيع غير موجودة');
    }
    
    const sale = saleResult.rows[0];
    const totalAmount = Number(sale.total_amount) || 0;
    const productName = await getProductName(sale.product_id);
    
    const confirmationMessage = `
      <div class="mb-4 text-right">
        <p class="font-bold text-lg">تأكيد الحذف</p>
        <p class="mt-2">المنتج: <span class="font-semibold">${productName}</span></p>
        <p>المبلغ: <span class="font-semibold">${totalAmount.toFixed(2)}</span></p>
        <p>التاريخ: <span class="font-semibold">${new Date(sale.created_at).toLocaleString('ar-EG')}</span></p>
      </div>
      <p class="text-red-600 font-bold">هل أنت متأكد من حذف هذه العملية؟</p>
    `;
    
    const userConfirmed = await showCustomConfirmation(confirmationMessage);
    if (!userConfirmed) return;
    
    await pool.query('DELETE FROM product_sales WHERE id = $1', [saleId]);
    showAlert('success', 'تم حذف عملية البيع بنجاح');
    await loadSales();
    
  } catch (error) {
    console.error('Error deleting sale:', error);
    showAlert('error', `خطأ في حذف عملية البيع: ${error.message}`);
  }
}

// UI Helpers
function showCustomConfirmation(message) {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    dialog.innerHTML = `
      <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        ${message}
        <div class="flex justify-end space-x-5 mt-4">
          <button id="confirmCancel" class="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 mx-3 rounded">
            إلغاء
          </button>
          <button id="confirmDelete" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded">
            نعم، احذف
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    document.getElementById('confirmDelete').onclick = () => {
      dialog.remove();
      resolve(true);
    };
    
    document.getElementById('confirmCancel').onclick = () => {
      dialog.remove();
      resolve(false);
    };
  });
}

function showAlert(type, message) {
  const alert = document.createElement('div');
  alert.className = `fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg border ${
    type === 'success' 
      ? 'bg-green-100 border-green-400 text-green-800' 
      : 'bg-red-100 border-red-400 text-red-800'
  }`;
  alert.innerHTML = `
    <div class="flex items-center">
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="mr-2 text-lg">
        &times;
      </button>
    </div>
  `;
  
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

// Make functions available globally
window.deleteSale = deleteSale;
window.getProductName = getProductName;
window.showCustomConfirmation = showCustomConfirmation;
window.showAlert = showAlert;

// Initialize
initDatabase();

// Add this function to create the simplified sales form
function createSalesForm() {
  const salesTab = document.getElementById('sales');
  if (!salesTab) return;

  salesTab.innerHTML = `
    <div class="bg-white p-6 rounded-lg shadow-md max-w-2xl mx-auto">
      <h2 class="text-2xl font-bold text-center mb-6">تسجيل المبيعات</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Product Selection -->
        <div class="col-span-1">
          <label class="block mb-2">المنتج</label>
          <select id="salesProduct" class="w-full p-2 border rounded" required>
            <option value="">اختر منتج</option>
          </select>
        </div>
        
        <!-- Quantity -->
        <div class="col-span-1">
          <label class="block mb-2">الكمية</label>
          <input type="number" id="salesQuantity" min="1" value="1" 
                 class="w-full p-2 border rounded" required>
        </div>
        
        <!-- Sale Type -->
        <div class="col-span-1">
          <label class="block mb-2">نوع البيع</label>
          <select id="salesType" class="w-full p-2 border rounded" required>
            <option value="retail">بيع قطاعي</option>
            <option value="wholesale">بيع جملة</option>
          </select>
        </div>
        
        <!-- Total Amount -->
        <div class="col-span-1">
          <label class="block mb-2">المبلغ الإجمالي</label>
          <input type="number" id="salesTotalAmount" min="0" step="0.01" 
                 class="w-full p-2 border rounded" required>
        </div>
        
        <!-- Paid Amount -->
        <div class="col-span-1">
          <label class="block mb-2">المبلغ المدفوع</label>
          <input type="number" id="salesPaidAmount" min="0" step="0.01" 
                 class="w-full p-2 border rounded" required>
        </div>
        
        <!-- Remaining Amount (auto-calculated) -->
        <div class="col-span-1">
          <label class="block mb-2">المبلغ المتبقي</label>
          <input type="number" id="salesRemainingAmount" readonly 
                 class="w-full p-2 border rounded bg-gray-100">
        </div>
        
        <!-- Notes -->
        <div class="col-span-2">
          <label class="block mb-2">ملاحظات</label>
          <textarea id="salesNotes" rows="2" class="w-full p-2 border rounded"></textarea>
        </div>
      </div>
      
      <!-- Submit Button -->
      <div class="mt-6 text-center">
        <button onclick="submitSale()" 
                class="bg-green-600 text-white px-6 py-2 rounded-lg">
          حفظ
        </button>
      </div>
    </div>
  `;

  // Setup event listeners
  document.getElementById('salesTotalAmount').addEventListener('input', calculateRemaining);
  document.getElementById('salesPaidAmount').addEventListener('input', calculateRemaining);
  
  // Populate products dropdown
  populateProductsDropdown();
}

// Populate products dropdown
async function populateProductsDropdown() {
  try {
    const result = await pool.query('SELECT id, name FROM products ORDER BY name');
    const select = document.getElementById('salesProduct');
    
    // Clear existing options
    select.innerHTML = '<option value="">اختر منتج</option>';
    
    result.rows.forEach(product => {
      const option = document.createElement('option');
      option.value = product.id;
      option.textContent = product.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading products:', error);
    alert('خطأ في تحميل قائمة المنتجات');
  }
}

// Calculate remaining amount
function calculateRemaining() {
  const total = parseFloat(document.getElementById('salesTotalAmount').value) || 0;
  const paid = parseFloat(document.getElementById('salesPaidAmount').value) || 0;
  const remaining = total - paid;
  document.getElementById('salesRemainingAmount').value = remaining.toFixed(2);
}

// Submit sale to database
async function submitSale() {
  // Get form values
  const productId = document.getElementById('salesProduct').value;
  const quantity = parseInt(document.getElementById('salesQuantity').value) || 1;
  const saleType = document.getElementById('salesType').value;
  const totalAmount = parseFloat(document.getElementById('salesTotalAmount').value);
  const paidAmount = parseFloat(document.getElementById('salesPaidAmount').value) || 0;
  const remainingAmount = totalAmount - paidAmount;
  const notes = document.getElementById('salesNotes').value.trim();

  // Validate inputs
  if (!productId) {
    alert('يجب اختيار المنتج');
    return;
  }
  
  if (isNaN(quantity) || quantity < 1) {
    alert('يجب إدخال كمية صحيحة');
    return;
  }
  
  if (isNaN(totalAmount) || totalAmount <= 0) {
    alert('يجب إدخال مبلغ إجمالي صحيح');
    return;
  }
  
  if (isNaN(paidAmount) || paidAmount < 0) {
    alert('يجب إدخال مبلغ مدفوع صحيح');
    return;
  }
  
  if (paidAmount > totalAmount) {
    alert('المبلغ المدفوع لا يمكن أن يكون أكبر من المبلغ الإجمالي');
    return;
  }

  try {
    // Insert into product_sales table
    await pool.query(
      `INSERT INTO product_sales (
        product_id, quantity, sale_type, 
        total_amount, paid_amount, remaining_amount, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [productId, quantity, saleType, totalAmount, paidAmount, remainingAmount, notes]
    );
    
    // Reset form
    document.getElementById('salesProduct').value = '';
    document.getElementById('salesQuantity').value = '1';
    document.getElementById('salesType').value = 'retail';
    document.getElementById('salesTotalAmount').value = '';
    document.getElementById('salesPaidAmount').value = '';
    document.getElementById('salesRemainingAmount').value = '';
    document.getElementById('salesNotes').value = '';
    
    alert('تم تسجيل عملية البيع بنجاح');
  } catch (error) {
    console.error('Error saving sale:', error);
    alert('حدث خطأ أثناء حفظ البيانات: ' + error.message);
  }
}

async function loadSales() {
  try {
    const result = await pool.query(`
      SELECT ps.*, p.name as product_name 
      FROM product_sales ps
      LEFT JOIN products p ON ps.product_id = p.id
      ORDER BY ps.created_at DESC
    `);
    
    const salesTableBody = document.getElementById('salesTableBody');
    if (!salesTableBody) {
      console.error('Sales table body element not found');
      return;
    }
    
    salesTableBody.innerHTML = '';
    
    if (!result.rows || result.rows.length === 0) {
      salesTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="p-4 text-center text-gray-500">لا توجد مبيعات مسجلة</td>
        </tr>
      `;
    } else {
      result.rows.forEach(sale => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50';
        row.innerHTML = `
          <td class="p-3">${sale.product_name || 'غير محدد'}</td>
          <td class="p-3">${sale.quantity}</td>
          <td class="p-3">${sale.sale_type === 'retail' ? 'قطاعي' : 'جملة'}</td>
          <td class="p-3">${Number(sale.total_amount).toFixed(2)}</td>
          <td class="p-3">${Number(sale.paid_amount).toFixed(2)}</td>
          <td class="p-3">${Number(sale.remaining_amount).toFixed(2)}</td>
          <td class="p-3">${new Date(sale.created_at).toLocaleString('ar-EG')}</td>
          <td class="p-3">${sale.notes || '-'}</td>
          <td class="p-3">
            <button onclick="deleteSale(${sale.id})" class="bg-red-500 text-white px-2 py-1 rounded text-sm">حذف</button>
          </td>
        `;
        salesTableBody.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error loading sales:', error.stack);
    alert('خطأ في تحميل المبيعات: ' + error.message);
  }
}

function createSalesForm() {
  const salesFormContainer = document.getElementById('salesFormContainer');
  if (!salesFormContainer) {
    console.error('Sales form container not found');
    return;
  }

  salesFormContainer.innerHTML = `
    <h3 class="text-xl font-bold mb-4 text-center">تسجيل عملية بيع جديدة</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="col-span-1">
        <label class="block mb-2 font-medium">المنتج</label>
        <select id="salesProduct" class="w-full p-3 border rounded-lg bg-blue-200 px-4" required>
          <option value="">اختر منتج</option>
        </select>
      </div>
      <div class="col-span-1">
        <label class="block mb-2 font-medium">الكمية</label>
        <input type="number" id="salesQuantity" min="1" value="1" 
               class="w-full p-3 border rounded-lg bg-gray-50" required>
      </div>
      <div class="col-span-1">
        <label class="block mb-2 font-medium">نوع البيع</label>
        <select id="salesType" class="w-full p-3 border rounded-lg bg-blue-200 px-4" required>
          <option value="retail">بيع قطاعي</option>
          <option value="wholesale">بيع جملة</option>
        </select>
      </div>
      <div class="col-span-1">
        <label class="block mb-2 font-medium">المبلغ الإجمالي</label>
        <input type="number" id="salesTotalAmount" min="0" step="0.01" 
               class="w-full p-3 border rounded-lg bg-gray-50" required>
      </div>
      <div class="col-span-1">
        <label class="block mb-2 font-medium">المبلغ المدفوع</label>
        <input type="number" id="salesPaidAmount" min="0" step="0.01" 
               class="w-full p-3 border rounded-lg bg-gray-50" required>
      </div>
      <div class="col-span-1">
        <label class="block mb-2 font-medium">المبلغ المتبقي</label>
        <input type="number" id="salesRemainingAmount" readonly 
               class="w-full p-3 border rounded-lg bg-gray-100">
      </div>
      <div class="col-span-2">
        <label class="block mb-2 font-medium">ملاحظات</label>
        <textarea id="salesNotes" rows="2" class="w-full p-3 border rounded-lg bg-gray-50"></textarea>
      </div>
    </div>
    <div class="mt-6 text-center">
      <button onclick="submitSale()" 
              class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium btn-hover">
        حفظ العملية
      </button>
    </div>
  `;

  // Setup event listeners
  document.getElementById('salesTotalAmount')?.addEventListener('input', calculateRemaining);
  document.getElementById('salesPaidAmount')?.addEventListener('input', calculateRemaining);
  
  // Populate products dropdown
  populateProductsDropdown();
}

// Modify the showTab function for sales
function showTab(tabId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  if (tabId === 'clients') loadClients();
  if (tabId === 'capital') loadCapital();
  if (tabId === 'expenses') loadExpenses();
  if (tabId === 'purchases') loadPurchases();
  if (tabId === 'manufacturing') loadProducts();
  if (tabId === 'sales') {
    createSalesForm();// This will now show only the form
    loadSales(); 
  }
  if (tabId === 'credit') loadCredit();
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
    
    // Add a section for the total remaining amount
    const totalDiv = document.createElement('div');
    totalDiv.className = 'bg-blue-100 p-4 rounded shadow mb-4';
    
    const clients = {};
    let totalRemaining = 0; // Variable to accumulate the total remaining amount
    
    result.rows.forEach(row => {
      if (!clients[row.id]) {
        clients[row.id] = { name: row.name, orders: [] };
      }
      if (row.order_id) {
        const remaining = (Number(row.amount) || 0) - (Number(row.paid) || 0);
        clients[row.id].orders.push({
          id: row.order_id,
          quantity: row.quantity,
          details: row.details,
          amount: Number(row.amount) || 0,
          paid: Number(row.paid) || 0,
          remaining: remaining,
          created_at: row.created_at,
        });
        totalRemaining += remaining; // Add to the total
      }
    });
    
    // Display the total remaining amount
    totalDiv.innerHTML = `
      <h3 class="text-xl font-bold text-blue-900">إجمالي المتبقي لجميع العملاء</h3>
      <p class="text-2xl font-bold">${totalRemaining.toFixed(2)}</p>
    `;
    creditList.appendChild(totalDiv);
    
    // Display each client's information
    for (const clientId in clients) {
      const client = clients[clientId];
      const clientRemaining = client.orders.reduce((sum, order) => sum + order.remaining, 0);
      
      const div = document.createElement('div');
      div.className = 'bg-white p-4 rounded shadow mb-4';
      div.innerHTML = `
        <h3 class="text-lg font-bold">${client.name}</h3>
        <p class="text-md mb-2">إجمالي المتبقي: ${clientRemaining.toFixed(2)}</p>
        <h4 class="font-semibold">الطلبيات:</h4>
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

// database backup
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const backupDir = path.join(__dirname, 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_factory_management_${timestamp}.sql`);
  const pgDumpCommand = `pg_dump -U postgres -h localhost -p 5432 factory_management > "${backupFile}"`;
  const button = document.getElementById('backupButton');
  button.disabled = true;
  button.innerText = 'جاري النسخ...';

  try {
    await new Promise((resolve, reject) => {
      exec(pgDumpCommand, { env: { ...process.env, PGPASSWORD: 'test' } }, (error, stdout, stderr) => {
        if (error) {
          console.error('Backup failed:', stderr);
          reject(new Error(`فشل النسخ الاحتياطي: ${stderr}`));
          return;
        }
        
        console.log('Backup created successfully:', backupFile);
        resolve();
      });
    });
    showAlert('success', 'تم إنشاء النسخة الاحتياطية بنجاح في ' + backupFile);
    const files = fs.readdirSync(backupDir).sort().reverse();
    const maxBackups = 7;
    if (files.length > maxBackups) {
      for (const file of files.slice(maxBackups)) {
        fs.unlinkSync(path.join(backupDir, file));
      }
    }
  } catch (error) {
    console.error('Error during backup:', error.message);
    showAlert('error', error.message);
  }
}

window.createBackup = createBackup;