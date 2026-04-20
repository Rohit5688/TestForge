import { HomePage } from './HomePage.js';
import { ResultsPage } from './ResultsPage.js';
import { CartPage } from './CartPage.js';
import { CheckoutPage } from './CheckoutPage.js';
import { InventoryPage } from './InventoryPage.js';
import { ProductDetailPage } from './ProductDetailPage.js';
import { LoginPage } from './LoginPage.js';
import { SimpleFormPage } from './SimpleFormPage.js';
import { AlertPage } from './AlertPage.js';
export class AppPages {
  // We use getters so page objects are instantiated lazily 
  // only when accessed inside the test step. This prevents 
  // premature initialization errors before the page fixture is ready.
  get home() { return new HomePage(); }
  get results() { return new ResultsPage(); }
  get cart() { return new CartPage(); }
  get checkout() { return new CheckoutPage(); }
  get inventory() { return new InventoryPage(); }
  get pdp() { return new ProductDetailPage(); }
  get login() { return new LoginPage(); }
  get simpleForm() { return new SimpleFormPage(); }
  get alert() { return new AlertPage(); }
}

export const app = new AppPages();
