import type { Next, Request, Response } from "../http"
import { HttpError } from "../lib/errors"
import { findAllProducts, findProductById } from "../repositories/product-repository"

// [GET: /api/products flow-1] Lists products
export async function listProducts(_req: Request, res: Response, next: Next) {
  try {
    const products = await findAllProducts()
    // [GET: /api/products flow-3] Responds 200 with the products
    res.status(200).json(products)
  } catch (error) {
    next(error)
  }
}

// [GET: /api/products/:id flow-1] Shows one product
export async function getProduct(req: Request, res: Response, next: Next) {
  try {
    const product = await findProductById(req.params.id!)
    // [GET: /api/products/:id flow-2 fail:404] No product with that id
    if (!product) throw new HttpError(404, "not found")
    // [GET: /api/products/:id flow-3] Responds 200 with the product
    res.status(200).json(product)
  } catch (error) {
    next(error)
  }
}
