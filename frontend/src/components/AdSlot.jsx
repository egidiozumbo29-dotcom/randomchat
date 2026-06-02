const AdSlot = ({ label = 'Advertisement', className = '' }) => {
  return (
    <div className={`bg-dark-700 border border-dark-600 rounded-lg flex items-center justify-center text-gray-500 text-sm min-h-[90px] ${className}`}>
      <div className="text-center px-4">
        <p className="font-medium text-gray-400">{label}</p>
        <p className="text-xs text-gray-600 mt-1">Google AdSense Ready</p>
      </div>
    </div>
  );
};

export default AdSlot;
