import type { Next, Request, Response } from "../http"
import { fcm } from "../lib/clients"
import { createCoupon, saveEvent } from "../repositories/event-repository"

interface EventInput {
  category: string
  title: string
}

// [POST: /api/events flow-1] Reads the incoming event
export async function postEvent(req: Request<EventInput>, res: Response, next: Next) {
  try {
    // [POST: /api/events flow-1 fail:400] Title is missing
    if (!req.body.title) return res.status(400).json({ error: "title is required" })

    const event = await saveEvent(req.body)

    // [POST: /api/events flow-3 branch] Dispatches on the event category
    switch (req.body.category) {
      case "notice": {
        // [POST: /api/events flow-4 case:notice] Builds the push payload from the title
        const message = { topic: "notices", notification: { title: req.body.title }, data: { eventId: event.id } }
        // [POST: /api/events flow-5 case:notice api:fcm] Pushes the notice to the topic subscribers
        await fcm.send(message)
        break
      }
      case "coupon":
        await createCoupon(event.id)
        break
      default:
        // [POST: /api/events flow-4 case:other fail:200] Unknown category: stored, nothing dispatched
        break
    }

    // [POST: /api/events flow-6] Responds with the event id
    res.status(200).json({ id: event.id })
  } catch (error) {
    next(error)
  }
}
