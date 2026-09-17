import { db } from "../lib/prisma"

// [GET: /api/products flow-2 db:products:read] Loads every product
export const findAllProducts = () => db.product.findMany({ orderBy: { name: "asc" } })

// [GET: /api/products/:id flow-2 db:products:read] Loads the product by id
// [POST: /api/orders flow-5 db:products:read] Loads the product being ordered
export const findProductById = (id: string) => db.product.findUnique({ where: { id } })
