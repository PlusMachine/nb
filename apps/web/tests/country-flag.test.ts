import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountryFlag } from "../components/shared/country-flag";

describe("country flag", () => {
  it("renders custom flags for catalog countries that previously fell back to placeholder", () => {
    const indonesia = renderToStaticMarkup(React.createElement(CountryFlag, { countryCode: "ID" }));
    const thailand = renderToStaticMarkup(React.createElement(CountryFlag, { countryCode: "TH" }));
    const vietnam = renderToStaticMarkup(React.createElement(CountryFlag, { countryCode: "VN" }));

    expect(indonesia).toContain("#CE1126");
    expect(indonesia).not.toContain("#E4E4E7");

    expect(thailand).toContain("#2D2A4A");
    expect(thailand).not.toContain("#E4E4E7");

    expect(vietnam).toContain("#DA251D");
    expect(vietnam).toContain("#FFFF00");
    expect(vietnam).not.toContain("#E4E4E7");
  });
});
