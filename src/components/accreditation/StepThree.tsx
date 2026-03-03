"use client";
import { useEffect } from "react";
import Image from "next/image";
import { useTranslation } from "@/components/accreditation/TranslationProvider";

interface Data {
  message: string;
  consent: boolean;
}

interface Props {
  data: Data;
  update: (patch: Partial<Data>) => void;
  onValidityChange: (v: boolean) => void;
}

export default function StepThree({ data, update, onValidityChange }: Props) {
  const { message, consent } = data;
  const { t } = useTranslation();

  const valid = consent;
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

  return (
    <div className="flex flex-col w-full">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Image
            src="/accreditation/progressbar/Vector (2).svg"
            alt="Message"
            width={20}
            height={20}
            className="w-5 h-5"
          />
          <h2 className="text-lg font-bold">{t.message}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">&bull; {t.optional}</p>

        <label htmlFor="msg" className="text-sm font-medium block mb-1">
          {t.yourMessage}
        </label>
        <textarea
          id="msg"
          rows={4}
          value={message}
          onChange={(e) => update({ message: e.target.value })}
          placeholder={t.writeHere}
          className="w-full border border-[#C6C6C6] rounded-md px-3 py-2 focus:ring-primary focus:border-primary mb-4"
        />

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => update({ consent: e.target.checked })}
            className="accent-primary"
          />
          {t.consent}
        </label>
      </div>
    </div>
  );
}
