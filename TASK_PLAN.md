# Task: Scenario Selection mit 3 Buttons für Host

## Implementierungs-Schritte

### Phase 1: State-Variablen hinzufügen
- [x] Drei neue State-Variablen für die drei Modals:
  - `showPresetScenarios` (boolean) - für gespeicherte Szenarios
  - `showCustomScenarioInput` (boolean) - für eigenes Szenario Input
  - `showCommunitySuggestions` (boolean) - für Vorschläge der anderen (umbenennen von `showSuggestions`)

### Phase 2: UI-Änderungen - Host Scenario Selection Area
- [x] Dropdown + Input Combo entfernen
- [x] Drei Buttons hinzufügen:
  - Button 1: "Gespeicherte Szenarios" - öffnet Preset Modal
  - Button 2: "Eigenes Szenario" - öffnet Custom Input Modal  
  - Button 3: "Vorschläge der anderen" - öffnet Suggestions Modal

### Phase 3: Modal-Komponenten erstellen
- [x] **Preset Scenarios Modal** (neu):
  - Zeigt alle 12 SCENARIOS zur Auswahl
  - Click auf Item setzt `scenario` State und schließt Modal
  - Zeigt aktuelles Szenario als markiert

- [x] **Custom Input Modal** (neu):
  - Text-Eingabefeld für eigene Szenarien
  - "Speichern" Button setzt `scenario` State
  - Zeigt aktuelles scenario wenn bereits gesetzt

- [x] **Community Suggestions Modal** (Umstrukturierung):
  - Umbenennung von `showSuggestions` zu `showCommunitySuggestions`
  - Gleiche Funktionalität wie zuvor, aber als eigenständiges Modal

### Phase 4: Styling
- [x] CSS für neue Buttons
- [x] CSS für Modals (falls nötig)

## Abhängigkeiten
- Keine neuen API-Routes nötig
- Bestehende `/api/scenario-suggestions` wird wiederverwendet

## Erwartetes Ergebnis
Host sieht 3 Buttons statt der aktuellen Dropdown/Eingabe-Kombination.
Jeder Button öffnet ein eigenes Modal zur Szenario-Auswahl.

## ✅ FERTIG - Alle Phasen abgeschlossen
