import React from 'react';
import DeliveryNoteModal from './DeliveryNoteModal';

// Shared HD camera / full-screen review, invoice-specific email metadata.
// Keeps the dashboard's existing InvoiceModal entrypoint unchanged.
const InvoiceModal = ({ onClose }) => (
    <DeliveryNoteModal onClose={onClose} mode="invoice" />
);

export default InvoiceModal;
