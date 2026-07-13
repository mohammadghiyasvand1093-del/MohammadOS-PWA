export default function CoachReportModal({
  isOpen,
  onClose,
  isLoading,
  error,
  reportData,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-subtle rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 relative"
        style={{ backgroundColor: "#131922", borderColor: "#232B36" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-subtle pb-3 mb-4">
          <h3 className="text-lg font-bold text-main font-sans">
            گزارش مربی هوشمند
          </h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-main font-mono"
          >
            [ X ]
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-subtle border-t-amber-active rounded-full animate-spin mb-4"></div>
            <p className="text-sm font-mono text-muted">
              در حال تحلیل داده‌ها توسط AI...
            </p>
          </div>
        )}

        {error && !isLoading && (
          <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-4 rounded-md text-center">
            <p className="font-mono text-sm">[!] خطا در ارتباط با مربی</p>
            <p className="text-xs mt-2 text-red-300">{error}</p>
          </div>
        )}

        {!isLoading && !error && reportData && (
          <div className="space-y-4 text-main">
            <div>
              <h4 className="text-xs font-mono text-amber-active mb-1">
                [ 01 ] SUMMARY
              </h4>
              <p className="text-sm leading-relaxed">
                {reportData.summary || "خلاصه‌ای موجود نیست."}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-mono text-steel-blue mb-1">
                [ 02 ] CRITICAL CHECK
              </h4>
              <p className="text-sm leading-relaxed">
                {reportData.critical_check || "بدون بررسی."}
              </p>
            </div>

            {reportData.delays && reportData.delays.length > 0 && (
              <div>
                <h4 className="text-xs font-mono text-red-400 mb-1">
                  [ 03 ] DELAYS
                </h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {reportData.delays.map((delay, index) => (
                    <li key={index}>{delay}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-base p-4 rounded-md border border-subtle mt-4">
              <h4 className="text-xs font-mono text-sage-green mb-1">
                [ 04 ] CHALLENGE QUESTION
              </h4>
              <p className="text-sm font-bold text-main italic">
                "{reportData.challenge_question || ""}"
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
