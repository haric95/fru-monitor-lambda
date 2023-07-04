"use strict";

const fetch = require("node-fetch");
const parser = require("node-html-parser");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const parseCookies = (response) => {
  const raw = response.headers.raw()["set-cookie"];
  const mapper = raw
    .map((entry) => {
      const parts = entry.split(";");
      const cookiePart = parts[0];
      return cookiePart;
    })
    .join(";");
  return mapper;
};

const getSessionId = async () => {
  const response = await fetch("https://fruonline.org.uk/LogOn", {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "sec-gpc": "1",
      "upgrade-insecure-requests": "1",
    },
    referrerPolicy: "strict-origin-when-cross-origin",
    body: null,
    method: "GET",
  });

  const parsedCookies = parseCookies(response);

  return parsedCookies;
};

const fetchLoginCookie = async (cookie) => {
  const res = await fetch("https://fruonline.org.uk/LogOn", {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.7",
      "Cache-Control": "max-age=0",
      Connection: "keep-alive",
      Cookie: cookie,
      Origin: "https://fruonline.org.uk",
      Referer: "https://fruonline.org.uk/LogOn",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
      "Sec-GPC": "1",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    },
    body: new URLSearchParams({
      UserName: process.env.USERNAME,
      Password: process.env.PASSWORD,
      forgot: "false",
      register: "false",
      btnSubmit: "Submit",
    }),
  });

  const cookies = parseCookies(res);

  return cookies;
};

const makeCaseRequest = async (cookie, subject, grading) => {
  const res = await fetch("https://fruonline.org.uk/Case/Filter", {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.7",
      "cache-control": "max-age=0",
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
      "sec-gpc": "1",
      "upgrade-insecure-requests": "1",
      cookie,
      Referer: "https://fruonline.org.uk/Case",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    // body: `SelectedGrading=Any+Rep&SelectedSubject=${subject}`,
    body: `SelectedGrading=${grading}&SelectedSubject=${subject}`,
    method: "POST",
  });
  return res;
};

const isCaseAvailable = async (cookie, subject, grading) => {
  const res = await makeCaseRequest(cookie, subject, grading);

  const body = await res.text();
  const root = parser.parse(body);
  const table = root.querySelector(".unfloat_table");

  if (table.innerText.includes("No legal cases found.")) {
    return null;
  }

  return table.querySelector("table");
};

const sendEmail = async (htmlContent) => {
  const msg = {
    to: process.env.TARGET_EMAIL, // Change to your recipient
    from: "frumonitor@proton.me", // Change to your verified sender
    subject: "FRU Cases Available",
    text: "Latest FRU updates",
    html: htmlContent,
  };
  try {
    console.log("worked");
    return await sgMail.send(msg);
  } catch (err) {
    console.log("error sending email");
    console.log(err);
  }
};

module.exports.run = async () => {
  const sessionCookie = await getSessionId();
  const loginCookie = await fetchLoginCookie(sessionCookie);
  const jointCookie = [sessionCookie, loginCookie].join("; ");

  const employmentTable = await isCaseAvailable(
    jointCookie,
    "Employment",
    "Any+Rep"
  );
  const ssTable = await isCaseAvailable(
    jointCookie,
    "Social+Security",
    "Any+Rep"
  );
  const ssTable2 = await isCaseAvailable(
    jointCookie,
    "Social+Security",
    "Not+First+or+Second+Case"
  );

  if (employmentTable || ssTable) {
    const html = [employmentTable, ssTable, ssTable2]
      .filter((table) => !!table)
      .join("\n<br />\n<br />\n");
    const a = await sendEmail(html);
    console.log(a);
    return "sent email";
  } else {
    console.log("no jobs available");
    return "no jobs available";
  }
};
