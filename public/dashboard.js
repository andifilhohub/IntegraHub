// Dashboard functionality
const API_BASE = '/v1';
let currentPage = 1;
const limit = 50;

// Check authentication
const token = localStorage.getItem('authToken');
if (!token) {
    window.location.href = '/login.html';
}

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
});

// Tab switching
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Update active tab button
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format file size
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Format currency
function formatCurrency(value) {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/dashboard/stats?token=${encodeURIComponent(token)}`);
        
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                window.location.href = '/login.html';
                return;
            }
            throw new Error('Failed to load stats');
        }
        
        const stats = await response.json();
        
        document.getElementById('totalProducts').textContent = stats.totalProducts.toLocaleString('pt-BR');
        document.getElementById('activeProducts').textContent = stats.activeProducts.toLocaleString('pt-BR');
        document.getElementById('totalPharmacies').textContent = stats.totalPharmacies.toLocaleString('pt-BR');
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load buffer files
async function loadBufferFiles() {
    const tbody = document.getElementById('bufferTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Carregando...</td></tr>';
    
    try {
        const response = await fetch(`${API_BASE}/dashboard/buffer?token=${encodeURIComponent(token)}`);
        
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                window.location.href = '/login.html';
                return;
            }
            throw new Error('Failed to load buffer files');
        }
        
        const files = await response.json();
        
        // Update buffer files count
        document.getElementById('bufferFiles').textContent = files.length.toLocaleString('pt-BR');
        
        if (files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Nenhum arquivo no buffer</td></tr>';
            return;
        }
        
        tbody.innerHTML = files.map(file => `
            <tr>
                <td><code>${file.fileName}</code></td>
                <td>${formatDate(file.createdAt)}</td>
                <td><span class="badge badge-${file.loadType === 'full' ? 'warning' : 'info'}">${file.loadType || 'N/A'}</span></td>
                <td>${file.productsCount}</td>
                <td>${formatFileSize(file.size)}</td>
                <td>
                    <button class="btn-small" onclick="viewBufferDetails(${files.indexOf(file)})">Ver Detalhes</button>
                </td>
            </tr>
        `).join('');
        
        // Store files data for modal
        window.bufferFilesData = files;
        
    } catch (error) {
        console.error('Error loading buffer files:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Erro ao carregar arquivos</td></tr>';
    }
}

// View buffer details
function viewBufferDetails(index) {
    const file = window.bufferFilesData[index];
    const modal = document.getElementById('bufferModal');
    const detailsElement = document.getElementById('bufferDetails');
    
    detailsElement.textContent = JSON.stringify(file.data, null, 2);
    modal.classList.add('active');
}

// Close modal
document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('bufferModal').classList.remove('active');
});

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('bufferModal');
    if (event.target === modal) {
        modal.classList.remove('active');
    }
});

// Load processed products
async function loadProcessedProducts(page = 1) {
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Carregando...</td></tr>';
    
    try {
        const response = await fetch(
            `${API_BASE}/dashboard/products?token=${encodeURIComponent(token)}&page=${page}&limit=${limit}`
        );
        
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('authToken');
                window.location.href = '/login.html';
                return;
            }
            throw new Error('Failed to load products');
        }
        
        const data = await response.json();
        
        if (data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">Nenhum produto encontrado</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.items.map(product => `
            <tr>
                <td>${product.id}</td>
                <td>
                    <strong>${product.pharmacy.name}</strong><br>
                    <small>${product.pharmacy.cnpj}</small>
                </td>
                <td>${product.title}</td>
                <td>${product.ean || '-'}</td>
                <td>${formatCurrency(product.price)}</td>
                <td>${product.stock !== null ? product.stock : '-'}</td>
                <td>
                    <span class="badge badge-${product.isActive ? 'success' : 'danger'}">
                        ${product.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td>${formatDate(product.updatedAt)}</td>
            </tr>
        `).join('');
        
        // Update pagination
        currentPage = data.pagination.page;
        document.getElementById('pageInfo').textContent = 
            `Página ${data.pagination.page} de ${data.pagination.totalPages || 1}`;
        
        document.getElementById('prevPage').disabled = data.pagination.page === 1;
        document.getElementById('nextPage').disabled = 
            data.pagination.page >= data.pagination.totalPages || data.items.length < limit;
        
    } catch (error) {
        console.error('Error loading products:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Erro ao carregar produtos</td></tr>';
    }
}

// Pagination controls
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        loadProcessedProducts(currentPage - 1);
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    loadProcessedProducts(currentPage + 1);
});

// Refresh buttons
document.getElementById('refreshBuffer').addEventListener('click', loadBufferFiles);
document.getElementById('refreshProducts').addEventListener('click', () => loadProcessedProducts(currentPage));

// Initial load
loadStats();
loadBufferFiles();
loadProcessedProducts();

// Auto-refresh every 30 seconds
setInterval(() => {
    loadStats();
    
    // Only refresh the active tab
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab.id === 'buffer-tab') {
        loadBufferFiles();
    } else if (activeTab.id === 'products-tab') {
        loadProcessedProducts(currentPage);
    }
}, 30000);
