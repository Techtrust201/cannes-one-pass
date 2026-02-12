"use client";

import { PhoneInput as ReactPhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

interface PhoneInputProps {
  /** Full international phone value, e.g. "+33612345678" */
  value: string;
  /** Called with full phone string (including dial code) */
  onChange: (phone: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
}

/**
 * Composant d'input téléphonique professionnel avec drapeaux et indicatifs.
 * Utilise react-international-phone sous le capot.
 * Stocke le numéro complet (avec indicatif) dans une seule string.
 */
export default function PhoneInput({
  value,
  onChange,
  placeholder = "Numéro de téléphone",
  error = false,
}: PhoneInputProps) {
  return (
    <ReactPhoneInput
      defaultCountry="fr"
      value={value}
      onChange={(phone) => onChange(phone)}
      placeholder={placeholder}
      inputClassName="!text-sm !py-1.5 !rounded-r-md !border-0 !shadow-none !ring-0 focus:!ring-0 focus:!outline-none"
      countrySelectorStyleProps={{
        buttonClassName: "!border-0 !bg-gray-50 !rounded-l-md !px-2 hover:!bg-gray-100 !shadow-none",
        dropdownStyleProps: {
          className: "!z-50 !rounded-lg !shadow-lg !border !border-gray-200",
          listItemClassName: "!text-sm !py-2",
        },
      }}
      className={`!rounded-md !border ${error ? "!border-red-500" : "!border-gray-300"} focus-within:!ring-2 focus-within:!ring-primary focus-within:!border-primary !shadow-sm`}
      preferredCountries={["fr", "be", "ch", "de", "es", "it", "gb", "nl", "pt"]}
      forceDialCode
    />
  );
}
