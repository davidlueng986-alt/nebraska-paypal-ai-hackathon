"use client";
import { useData } from "../lib/data";

/** Demo only: switch between the fictional maintainers. Hidden for a signed-in maintainer. */
export function MaintainerPicker() {
  const { boot, maintainerId, setMaintainerId, mode } = useData();
  if (mode !== "demo" || !boot || boot.actor.role !== "admin" || boot.maintainers.length < 2) return null;
  return (
    <div className="form-group" style={{ width: 220 }}>
      <label htmlFor="who" className="visually-hidden">
        Maintainer (fictional)
      </label>
      <select id="who" className="form-control" value={maintainerId} onChange={(e) => setMaintainerId(e.target.value)}>
        {boot.maintainers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.login} (fictional)
          </option>
        ))}
      </select>
    </div>
  );
}
