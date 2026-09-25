"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";

/** Seller/admin fulfilment for an order: ship (carrier + tracking) or mark delivered. */
export function FulfilAction({ orderId, status, paymentMethod, invalidate }: { orderId: string; status: string; paymentMethod: string; invalidate: unknown[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("UPS");
  const [tracking, setTracking] = useState("");
  const m = useMutation({
    mutationFn: (body: object) => api(`/api/orders/${orderId}/fulfillment`, { body }),
    onSuccess: () => {
      toast.success("Order updated");
      setOpen(false);
      qc.invalidateQueries({ queryKey: invalidate });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const canShip = status === (paymentMethod === "CARD" ? "PROCESSING" : "ESCROWED");
  if (status === "SHIPPED")
    return (
      <Button size="sm" variant="outline" loading={m.isPending} onClick={() => m.mutate({ action: "deliver" })}>
        Mark delivered
      </Button>
    );
  if (!canShip) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Ship
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Mark as shipped" description="The buyer sees the carrier and a tracking link on their order page.">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate(paymentMethod === "CARD" ? { action: "ship", carrier, trackingNumber: tracking } : { action: "ship", trackingNumber: tracking });
            }}
          >
            {paymentMethod === "CARD" && (
              <Field label="Carrier" htmlFor={`car-${orderId}`}>
                <Select id={`car-${orderId}`} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                  {["UPS", "USPS", "FEDEX", "DHL", "OTHER"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Tracking number" htmlFor={`trk-${orderId}`}>
              <Input id={`trk-${orderId}`} value={tracking} onChange={(e) => setTracking(e.target.value)} required minLength={4} />
            </Field>
            <Button type="submit" loading={m.isPending} className="w-full">
              Mark shipped
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
