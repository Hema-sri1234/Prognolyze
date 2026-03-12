import React from 'react';
import MedicalDashboard from './MedicalDashboard';
import ApiStatus from './ApiStatus';

/**
 * PrognolyzeApp is the main entry point for the application.
 * It includes the MedicalDashboard and an ApiStatus validator 
 * to ensure the environment is correctly configured.
 */
export default function PrognolyzeApp() {
  return (
    <>
      <MedicalDashboard />
      <ApiStatus />
    </>
  );
}
