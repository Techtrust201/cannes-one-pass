"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { StepProps } from "../../types";
import type { RxFormData } from "../types";

/**
 * Step 2 RX — Coordonnées du demandeur.
 *
 * Aligné sur la card 2 de la maquette validée : 4 champs obligatoires
 * (Nom, Prénom, Email, Téléphone). Pas de récap visuel, c'est la
 * personne qui sera contactée pour le suivi de l'accréditation.
 */
export function StepContactRx({
  data,
  update,
  onValidityChange,
}: StepProps<RxFormData>) {
  const contact = data.contact;
  const setContact = (patch: Partial<typeof contact>) => {
    update({ contact: { ...contact, ...patch } } as Partial<RxFormData>);
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email);
  const phoneValid = /^[\d\s+\-()]{8,}$/.test(contact.phoneNumber);
  const lastNameValid = contact.lastName.trim().length > 0;
  const firstNameValid = contact.firstName.trim().length > 0;

  const isValid = emailValid && phoneValid && lastNameValid && firstNameValid;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  return (
    <div className="flex flex-col w-full gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">
          Coordonnées du demandeur
        </h2>
        <p className="text-sm text-gray-500">
          Personne en charge du dossier d&apos;accréditation pour ce stand.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="rx-lastname" className="text-sm font-semibold text-gray-700">
            Nom <span className="text-red-500">*</span>
          </label>
          <input
            id="rx-lastname"
            value={contact.lastName}
            onChange={(e) => setContact({ lastName: e.target.value })}
            placeholder="Dupont"
            autoComplete="family-name"
            className={cn(
              "w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
              lastNameValid ? "border-gray-300" : "border-red-300"
            )}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="rx-firstname" className="text-sm font-semibold text-gray-700">
            Prénom <span className="text-red-500">*</span>
          </label>
          <input
            id="rx-firstname"
            value={contact.firstName}
            onChange={(e) => setContact({ firstName: e.target.value })}
            placeholder="Jean"
            autoComplete="given-name"
            className={cn(
              "w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
              firstNameValid ? "border-gray-300" : "border-red-300"
            )}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label htmlFor="rx-email" className="text-sm font-semibold text-gray-700">
            Adresse e-mail <span className="text-red-500">*</span>
          </label>
          <input
            id="rx-email"
            type="email"
            value={contact.email}
            onChange={(e) => setContact({ email: e.target.value })}
            placeholder="jean.dupont@entreprise.com"
            autoComplete="email"
            className={cn(
              "w-full rounded-md border px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
              !contact.email || emailValid ? "border-gray-300" : "border-red-300"
            )}
          />
          {contact.email && !emailValid && (
            <p className="text-xs text-red-600">Adresse e-mail invalide.</p>
          )}
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-semibold text-gray-700">
            Téléphone portable <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              value={contact.phoneCode}
              onChange={(e) => setContact({ phoneCode: e.target.value })}
              className="w-20 rounded-md border border-gray-300 px-3 py-2 shadow-sm"
              placeholder="+33"
              aria-label="Indicatif téléphonique"
            />
            <input
              value={contact.phoneNumber}
              onChange={(e) => setContact({ phoneNumber: e.target.value })}
              placeholder="6 12 34 56 78"
              autoComplete="tel"
              className={cn(
                "flex-1 rounded-md border px-3 py-2 shadow-sm focus:ring-primary focus:border-primary",
                !contact.phoneNumber || phoneValid ? "border-gray-300" : "border-red-300"
              )}
            />
          </div>
          {contact.phoneNumber && !phoneValid && (
            <p className="text-xs text-red-600">Numéro de téléphone invalide.</p>
          )}
        </div>
      </div>
    </div>
  );
}
