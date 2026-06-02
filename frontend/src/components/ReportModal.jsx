import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'sexual', label: 'Contenuto sessuale' },
  { value: 'harassment', label: 'Molestie' },
  { value: 'other', label: 'Altro' },
];

const ReportModal = ({ isOpen, onClose, onSubmit }) => {
  const [reason, setReason] = useState('spam');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={20} />
            <h3 className="font-semibold text-white">Segnala utente</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <X size={20} />
          </button>
        </div>
        
        <p className="text-gray-400 text-sm mb-4">
          Seleziona il motivo della segnalazione. Gli utenti con troppe segnalazioni verranno bannati automaticamente.
        </p>

        <div className="space-y-2 mb-6">
          {REASONS.map((r) => (
            <label key={r.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${reason === r.value ? 'border-brand-primary bg-brand-primary/10' : 'border-dark-600 hover:border-dark-600'}`}>
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={(e) => setReason(e.target.value)}
                className="accent-brand-primary"
              />
              <span className="text-sm text-gray-200">{r.label}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-dark-600 text-gray-300 hover:bg-dark-700 transition text-sm font-medium"
          >
            Annulla
          </button>
          <button
            onClick={() => { onSubmit(reason); onClose(); }}
            className="flex-1 py-2.5 rounded-lg bg-red-500/90 hover:bg-red-500 text-white transition text-sm font-medium"
          >
            Segnala
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
