// Login functionality
const API_BASE = '/v1';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginBtnSpinner = document.getElementById('loginBtnSpinner');
    const errorMessage = document.getElementById('error-message');
    const secretInput = document.getElementById('secret');
    
    const secret = secretInput.value;
    
    // Disable button and show spinner
    loginBtn.disabled = true;
    loginBtnText.style.display = 'none';
    loginBtnSpinner.style.display = 'block';
    errorMessage.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE}/dashboard/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ secret }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Chave inválida');
        }
        
        const data = await response.json();
        
        // Store token in localStorage
        localStorage.setItem('authToken', data.token);
        
        // Redirect to dashboard
        window.location.href = '/dashboard.html';
        
    } catch (error) {
        console.error('Login error:', error);
        errorMessage.textContent = error.message || 'Erro ao fazer login. Verifique sua chave de acesso.';
        errorMessage.style.display = 'block';
        
        // Re-enable button
        loginBtn.disabled = false;
        loginBtnText.style.display = 'block';
        loginBtnSpinner.style.display = 'none';
    }
});

// Check if already authenticated
const token = localStorage.getItem('authToken');
if (token) {
    // Verify token is still valid
    fetch(`${API_BASE}/dashboard/stats?token=${encodeURIComponent(token)}`)
        .then(response => {
            if (response.ok) {
                window.location.href = '/dashboard.html';
            }
        })
        .catch(() => {
            // Token invalid, clear it
            localStorage.removeItem('authToken');
        });
}
