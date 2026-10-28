import './styles/main.css';
import { eventBus } from './core/EventBus.js';

eventBus.emit('app:ready');
