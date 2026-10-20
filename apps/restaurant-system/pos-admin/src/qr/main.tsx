import {initializeDisplayPreferences} from '@jamanvaar/ui';
import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "./product.css";
import { QrProduct } from "./QrProduct";
document.documentElement.classList.add('qr-document');
initializeDisplayPreferences({ application: 'qr-admin', restaurantKey: 'jamanvaar_cloud_restaurant_id' });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QrProduct />
  </React.StrictMode>,
);
