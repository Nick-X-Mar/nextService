"""
DnsStack
========
The public DNS zone of nextservice.gr, in Route 53.

The domain stays registered at Pointer; only its name servers point here
(set at Pointer, the stack outputs them). Everything the domain resolves to is
declared below — this file *is* the zone, and a record added anywhere else
(the Plesk panel at Pointer included) is not served.

What lives in the zone:
  - Mail is still hosted at Pointer: MX, mail/webmail/mail2, the SRV records,
    SPF and Plesk's own DKIM key (`default._domainkey`) all point there.
  - Both stages send through SES as nextservice.gr, so each region's Easy DKIM
    CNAMEs are here — staging's and production's. They never change for the
    life of an identity (SES rotates the keys behind them).
  - The apex and www still serve the old WordPress site at Pointer until the
    domain cutover moves them to Amplify.

Deployed with the production stage only, so a bare `cdk deploy --all` (which
targets staging) can never touch live DNS. One zone serves both stages.

Copied record by record from Pointer's name servers on 2026-10-29 (24 records,
both servers identical, no DNSSEC). The values are unchanged; the TTL is
lowered from 1 day to 1 hour so the cutover propagates quickly.
"""

from aws_cdk import (
    Stack,
    CfnOutput,
    Duration,
    Fn,
    RemovalPolicy,
    aws_route53 as route53,
)
from constructs import Construct


DOMAIN = "nextservice.gr"

# Pointer's shared hosting (WordPress, mail.nextservice.gr) and its second MX.
POINTER_HOST_IP = "185.25.23.240"
POINTER_MAIL2_IP = "185.162.238.15"

# Easy DKIM tokens of the nextservice.gr SES identity in each stage's region:
# `aws sesv2 get-email-identity --email-identity nextservice.gr --region <r>`.
SES_DKIM_TOKENS = {
    "staging": [  # eu-central-1, verified by hand before the stacks existed
        "e3qs26y3ad6nq5dc2hl6ma26wlnqp2bz",
        "zgpqlin7nikdnqtsdctpwnwf34mbbrvl",
        "fuwo4oqbemmuzsyx32uqxsacxxfl7dv4",
    ],
    "production": [  # eu-south-1, the Notifications stack's DomainIdentity
        "tfjgzvbz6ucnxwrqaskxnqikxrtvyjb2",
        "rmwemfhntsqldlhowuzdg6ql7aj5dscu",
        "5szlotvkaecxk6asytal55mhw3c4anag",
    ],
}

# Plesk's DKIM key for mail sent from the Pointer mailboxes. Longer than one
# 255-byte TXT string; CDK splits it into chunks on synth.
PLESK_DKIM_KEY = (
    "v=DKIM1; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7uSdYiGLJST+JsN/BuH4AYhX8segj/"
    "VGNzKDALtdUvi9qH2on24DxWiTTr10JUuNOA9znFpdFfDbOvXfSDAVmabQk5cpvphCGc81BqZ24MGFHyq4RWev4X"
    "NfnrQyzHoUU3ht7gHvPOPMDAAJAvFuwIo97Jv93jGLb31M2FOssE4AHTj7gi3otm8XICzSwWzX+iS9zuoFvYJ49c"
    "foF9CZSs1lUEq1QfCO0tQ/wEmLLpQhL/2fVWiZY+7LkoflPSuKBKSqqY2glEDUj1a4CB44TbhNqizMO4xAkPBwVb"
    "JugBwzwpY0BRaJHJQHedSUeMy9++iPco3FjABbzp2hsn98fwIDAQAB;"
)

TTL = Duration.hours(1)


class DnsStack(Stack):
    """Route 53 public hosted zone for nextservice.gr and all its records."""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Deleting the stack or the zone would take the domain — site and
        # mail — offline; both are kept even if the code is removed.
        self.zone = route53.PublicHostedZone(self, "Zone", zone_name=DOMAIN)
        self.zone.apply_removal_policy(RemovalPolicy.RETAIN)
        zone = self.zone

        def a(construct_id: str, name: str | None, ip: str) -> None:
            route53.ARecord(self, construct_id, zone=zone, record_name=name,
                            target=route53.RecordTarget.from_ip_addresses(ip), ttl=TTL)

        def cname(construct_id: str, name: str, target: str) -> None:
            route53.CnameRecord(self, construct_id, zone=zone, record_name=name,
                                domain_name=target, ttl=TTL)

        def txt(construct_id: str, name: str | None, value: str) -> None:
            route53.TxtRecord(self, construct_id, zone=zone, record_name=name,
                              values=[value], ttl=TTL)

        def srv(construct_id: str, name: str, port: int) -> None:
            route53.SrvRecord(self, construct_id, zone=zone, record_name=name, ttl=TTL,
                              values=[route53.SrvRecordValue(
                                  priority=0, weight=0, port=port, host_name=DOMAIN)])

        # ── Website (old WordPress at Pointer until the cutover) ──
        a("ApexA", None, POINTER_HOST_IP)
        cname("WwwCname", "www", DOMAIN)
        cname("FtpCname", "ftp", DOMAIN)
        a("Ipv4A", "ipv4", POINTER_HOST_IP)
        # Plesk's vanity name-server hostnames. Nothing delegates to them, but
        # they resolved before, so they still do.
        a("Ns1A", "ns1", POINTER_HOST_IP)
        a("Ns2A", "ns2", POINTER_HOST_IP)

        # ── Mail, hosted at Pointer ──
        route53.MxRecord(self, "Mx", zone=zone, ttl=TTL, values=[
            route53.MxRecordValue(priority=10, host_name=f"mail.{DOMAIN}"),
            route53.MxRecordValue(priority=40, host_name=f"mail2.{DOMAIN}"),
        ])
        a("MailA", "mail", POINTER_HOST_IP)
        a("WebmailA", "webmail", POINTER_HOST_IP)
        a("Mail2A", "mail2", POINTER_MAIL2_IP)
        srv("ImapsSrv", "_imaps._tcp", 993)
        srv("Pop3sSrv", "_pop3s._tcp", 995)
        srv("SmtpsSrv", "_smtps._tcp", 465)

        # ── Sender authentication ──
        txt("Spf", None,
            "v=spf1 +a +mx include:spf.linux45.name-servers.gr include:amazonses.com -all")
        # Strict alignment: SES mail passes on its DKIM signature (d=nextservice.gr),
        # never on SPF, since its MAIL FROM is SES's own domain.
        txt("Dmarc", "_dmarc", "v=DMARC1; p=quarantine; adkim=s; aspf=s")
        txt("PleskDkim", "default._domainkey", PLESK_DKIM_KEY)
        txt("DomainkeyPolicy", "_domainkey", "o=-")
        # Legacy SES (v1) domain verification token, from staging's identity.
        txt("AmazonSesVerification", "_amazonses",
            "rMxodKB5NG9ykrBl6WkI8GptfqmT4G2ch9ZXvo/uPDg=")
        for stage, tokens in SES_DKIM_TOKENS.items():
            for i, token in enumerate(tokens, start=1):
                cname(f"SesDkim{stage.capitalize()}{i}", f"{token}._domainkey",
                      f"{token}.dkim.amazonses.com")

        CfnOutput(self, "NameServers",
                  value=Fn.join(" ", zone.hosted_zone_name_servers),
                  description="Set these as the domain's name servers at Pointer")
        CfnOutput(self, "HostedZoneId", value=zone.hosted_zone_id)
