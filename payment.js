/**
 * LURKER Universal Payment System
 * Used across all pages: become.html, sightings.html, agents.html, subscribe.html
 */

// Payment configuration
const PAYMENT_CONFIG = {
    wallets: {
        base: '0x2124556AC7056dD2C16b260b8F4e02748F44d1dC',
        ethereum: '0x2124556AC7056dD2C16b260b8F4e02748F44d1dC'
    },
    chains: {
        base: { name: 'Base', currency: 'USDC', icon: '🔵' },
        ethereum: { name: 'Ethereum', currency: 'USDT', icon: '⬛' }
    }
};

// Generate unique payment ID
function generatePaymentId() {
    return 'pay_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Open payment modal
function openPaymentModal(service, amount, description, features = []) {
    const modal = document.createElement('div');
    modal.className = 'payment-modal';
    modal.id = 'payment-modal';
    
    const paymentId = generatePaymentId();
    
    const featuresHtml = features.length > 0 
        ? `<ul class="payment-features">${features.map(f => `<li>✓ ${f}</li>`).join('')}</ul>`
        : '';
    
    modal.innerHTML = `
        <div class="payment-modal-overlay" onclick="closePaymentModal()"></div>
        <div class="payment-modal-content">
            <button class="payment-modal-close" onclick="closePaymentModal()">&times;</button>
            
            <h2>complete payment</h2>
            <div class="payment-service">${service}</div>
            <div class="payment-amount">$${amount}<span>/month</span></div>
            <p class="payment-desc">${description}</p>
            
            ${featuresHtml}
            
            <div class="payment-form">
                <div class="form-group">
                    <label>telegram username</label>
                    <input type="text" id="payment-telegram" placeholder="@username" required>
                </div>
                
                <div class="form-group">
                    <label>select chain</label>
                    <div class="chain-options">
                        <div class="chain-option selected" onclick="selectChain('base')">
                            <span class="chain-icon">🔵</span>
                            <span class="chain-name">Base</span>
                            <span class="chain-currency">USDC</span>
                        </div>
                        <div class="chain-option" onclick="selectChain('ethereum')">
                            <span class="chain-icon">⬛</span>
                            <span class="chain-name">Ethereum</span>
                            <span class="chain-currency">USDT</span>
                        </div>
                    </div>
                </div>
                
                <div class="wallet-section" id="wallet-section">
                    <label>send $${amount} to:</label>
                    <div class="wallet-address" id="wallet-address" onclick="copyWalletAddress()">
                        ${PAYMENT_CONFIG.wallets.base}
                    </div>
                    <small class="wallet-hint">click to copy • valid 24h</small>
                </div>
                
                <div class="payment-instructions">
                    <strong>how to pay:</strong>
                    <ol>
                        <li>send exact amount (or more) to the address</li>
                        <li>include your telegram in the memo if possible</li>
                        <li>message our bot with your tx hash</li>
                    </ol>
                </div>
                
                <div class="payment-confirm">
                    <p>message <strong>@lurker_sub_bot</strong>:</p>
                    <code>/paid ${paymentId} [transaction_hash]</code>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Store current selection
    window.currentPayment = {
        id: paymentId,
        service: service,
        amount: amount,
        chain: 'base'
    };
}

// Close payment modal
function closePaymentModal() {
    const modal = document.getElementById('payment-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// Select chain
function selectChain(chain) {
    window.currentPayment.chain = chain;
    
    // Update UI
    document.querySelectorAll('.chain-option').forEach(el => {
        el.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    // Update wallet address
    const walletAddress = PAYMENT_CONFIG.wallets[chain];
    document.getElementById('wallet-address').textContent = walletAddress;
}

// Copy wallet address
function copyWalletAddress() {
    const address = document.getElementById('wallet-address').textContent.trim();
    navigator.clipboard.writeText(address).then(() => {
        const el = document.getElementById('wallet-address');
        const original = el.textContent;
        el.textContent = 'copied!';
        setTimeout(() => {
            el.textContent = original;
        }, 1000);
    });
}

// Add payment styles
const paymentStyles = document.createElement('style');
paymentStyles.textContent = `
    .payment-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .payment-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(5px);
    }
    
    .payment-modal-content {
        position: relative;
        background: #111;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 2rem;
        max-width: 450px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        z-index: 10001;
    }
    
    .payment-modal-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        color: #666;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .payment-modal-close:hover {
        color: #fff;
    }
    
    .payment-modal h2 {
        margin: 0 0 0.5rem;
        font-size: 1.5rem;
    }
    
    .payment-service {
        color: #666;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }
    
    .payment-amount {
        font-size: 3rem;
        font-weight: bold;
        margin: 1rem 0;
    }
    
    .payment-amount span {
        font-size: 1rem;
        color: #666;
        font-weight: normal;
    }
    
    .payment-desc {
        color: #999;
        margin-bottom: 1rem;
    }
    
    .payment-features {
        list-style: none;
        padding: 0;
        margin: 0 0 1.5rem;
    }
    
    .payment-features li {
        padding: 0.3rem 0;
        color: #ccc;
    }
    
    .payment-form .form-group {
        margin-bottom: 1.5rem;
    }
    
    .payment-form label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
        color: #999;
    }
    
    .payment-form input {
        width: 100%;
        padding: 0.75rem;
        background: rgba(255,255,255,0.05);
        border: 1px solid #333;
        border-radius: 6px;
        color: #fff;
        font-size: 1rem;
    }
    
    .payment-form input:focus {
        outline: none;
        border-color: #ff6600;
    }
    
    .chain-options {
        display: flex;
        gap: 1rem;
    }
    
    .chain-option {
        flex: 1;
        padding: 1rem;
        background: rgba(255,255,255,0.03);
        border: 2px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        text-align: center;
        transition: all 0.2s;
    }
    
    .chain-option:hover,
    .chain-option.selected {
        border-color: #ff6600;
        background: rgba(255,102,0,0.1);
    }
    
    .chain-icon {
        display: block;
        font-size: 1.5rem;
        margin-bottom: 0.25rem;
    }
    
    .chain-name {
        display: block;
        font-size: 0.9rem;
    }
    
    .chain-currency {
        display: block;
        font-size: 0.75rem;
        color: #666;
    }
    
    .wallet-section {
        background: rgba(0,0,0,0.3);
        padding: 1rem;
        border-radius: 8px;
        margin: 1rem 0;
    }
    
    .wallet-address {
        font-family: monospace;
        font-size: 0.85rem;
        word-break: break-all;
        padding: 0.75rem;
        background: rgba(255,255,255,0.05);
        border-radius: 6px;
        margin: 0.5rem 0;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .wallet-address:hover {
        background: rgba(255,102,0,0.1);
    }
    
    .wallet-hint {
        display: block;
        color: #666;
        font-size: 0.75rem;
    }
    
    .payment-instructions {
        background: rgba(255,102,0,0.1);
        border-left: 3px solid #ff6600;
        padding: 1rem;
        margin: 1rem 0;
        font-size: 0.85rem;
    }
    
    .payment-instructions ol {
        margin: 0.5rem 0 0 1.2rem;
        padding: 0;
    }
    
    .payment-instructions li {
        margin: 0.25rem 0;
    }
    
    .payment-confirm {
        background: rgba(0,255,0,0.1);
        border-left: 3px solid #00ff00;
        padding: 1rem;
        margin-top: 1rem;
    }
    
    .payment-confirm code {
        display: block;
        background: rgba(0,0,0,0.3);
        padding: 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        margin-top: 0.5rem;
        word-break: break-all;
    }
    
    /* Mobile */
    @media (max-width: 480px) {
        .payment-modal-content {
            padding: 1.5rem;
            width: 95%;
        }
        
        .payment-amount {
            font-size: 2.5rem;
        }
        
        .chain-options {
            flex-direction: column;
        }
    }
    
    /* Payment button style */
    .btn-pay {
        display: inline-block;
        padding: 1rem 2rem;
        background: #ff6600;
        color: #000;
        text-decoration: none;
        font-weight: bold;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1rem;
    }
    
    .btn-pay:hover {
        background: #ff8844;
        transform: translateY(-2px);
    }
    
    .btn-pay-small {
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
    }
`;
document.head.appendChild(paymentStyles);
