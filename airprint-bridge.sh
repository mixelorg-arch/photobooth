#!/bin/bash
#
# Make a Mac-shared printer visible to an iPad.
#
# macOS will share a USB printer, but it shares it *to other Macs*. The
# Bonjour record it publishes is a CUPS record, and iOS ignores it: an iPad
# looks for three things that record does not have —
#
#   * the `_universal` subtype of `_ipp._tcp`
#   * a `URF=` key describing the raster the printer can take
#   * a `pdl=` list naming a format iOS is willing to send
#
# — which is why the printer is plainly advertised on the network, reachable,
# idle and ready, and the iPad still says "No AirPrint printers found".
# Nothing is broken; macOS simply stopped bridging non-AirPrint printers to
# iOS, and there is no setting that turns it back on.
#
# This publishes a second Bonjour record for the same CUPS queue, with the
# three missing pieces. Jobs still go to the same queue and the same driver;
# only discovery changes.
#
#   ./airprint-bridge.sh                 bridge _LABEL_9X00
#   ./airprint-bridge.sh <queue name>    bridge another one
#   lpstat -p                            list queue names
#
# Leave it running while you print. Ctrl-C stops advertising; nothing is left
# behind and no system setting is touched.
set -euo pipefail

QUEUE="${1:-_LABEL_9X00}"

if ! lpstat -p "$QUEUE" >/dev/null 2>&1; then
    echo "No printer queue called '$QUEUE'. Known queues:" >&2
    lpstat -p 2>/dev/null | sed 's/^printer /  /' >&2
    exit 1
fi

if [ "$(lpoptions -p "$QUEUE" 2>/dev/null | tr ' ' '\n' | grep -c 'printer-is-shared=true')" -eq 0 ]; then
    echo "'$QUEUE' is not shared, so there is nothing for the iPad to reach." >&2
    echo "Turn it on first:  lpadmin -p $QUEUE -o printer-is-shared=true" >&2
    exit 1
fi

DESC=$(lpstat -l -p "$QUEUE" 2>/dev/null | awk -F': ' '/Description/{print $2; exit}')
DESC=${DESC:-$QUEUE}
HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"

# A stable id, so the iPad does not see a different printer every launch.
UUID=$(echo -n "photobooth-airprint-$QUEUE" | shasum | cut -c1-32 |
       sed -E 's/(.{8})(.{4})(.{4})(.{4})(.{12})/\1-\2-\3-\4-\5/')

# `pdl` deliberately does NOT claim image/urf. iOS can send either URF raster
# or PDF, and this Mac's CUPS has no filter that reads URF — `rastertourf`
# writes it, nothing reads it — so a URF job would arrive and die. Leaving it
# out makes iOS send PDF, which `cgpdftoraster` already handles on the way to
# the label driver. The URF *key* still has to be there or iOS will not treat
# the printer as AirPrint at all; it describes capability, not job format.
#
# RS203 is the resolution: this is a 203dpi head, and saying so keeps iOS from
# rendering at 300 and making CUPS resample — which is what turns a dithered
# photograph back into a blob.
echo "Bridging '$DESC'"
echo "  queue    $QUEUE"
echo "  host     $HOST:631"
echo "  as       $DESC (AirPrint)"
echo
echo "Leave this running, then print from the iPad. Ctrl-C to stop."
echo

exec dns-sd -R "$DESC" "_ipp._tcp,_universal" . 631 \
    "txtvers=1" \
    "qtotal=1" \
    "rp=printers/$QUEUE" \
    "ty=$DESC" \
    "product=($DESC)" \
    "pdl=application/pdf,image/jpeg,image/png" \
    "URF=W8,CP1,RS203,DM1,IS1,MT1-2-3-4-5,OB9,PQ4,V1.4" \
    "adminurl=http://$HOST:631/printers/$QUEUE" \
    "priority=0" \
    "note=Photobooth" \
    "Color=F" \
    "Duplex=F" \
    "Scan=F" \
    "Fax=F" \
    "Binary=T" \
    "Transparent=T" \
    "TBCP=F" \
    "printer-state=3" \
    "printer-type=0x801046" \
    "UUID=$UUID"
