"use client";

// 複数選択チップ：選択で色変化・再タップで解除
export default function ChipGroup({
  options,
  selected,
  onChange,
  compact = false,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  compact?: boolean; // 幅を抑えたい機器リストなどで使用
}) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const size = compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";

  return (
    <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-full border font-medium transition active:scale-95 ${size} ${
              active
                ? "border-brand bg-brand text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
