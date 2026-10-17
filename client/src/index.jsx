import { definePage } from '@veeva/vault';
import { createRoot } from 'react-dom/client';
import App, { parseDocRef } from './App';
import './styles.css';

export default definePage(({ element }) => {
    const location = window.vaultLocation || window.location;
    const root = createRoot(element);
    root.render(<App initialDocRef={parseDocRef(location.href)} />);
});
