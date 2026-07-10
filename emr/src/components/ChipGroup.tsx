"use client";

// 複数選択チップ：選択で色変化・再タップで解除
export default function ChipGroup({
  options,
  selected,
  onChange,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95 ${
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
